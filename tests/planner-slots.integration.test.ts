import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import { Client } from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { closeDb, getDb } from '../db/index.ts';
import { libraryItems, posts, postTargets, publications, socialAccounts, users } from '../db/schema.ts';
import { createPost, updatePost } from '../lib/server/posts.ts';
import { createLibraryItem, listLibraryItems, updateLibraryItem } from '../lib/server/library-items.ts';
import * as library from '../lib/server/library-items.ts';
import { createPostSourceSchema } from '../lib/contracts/planner.ts';
import { creationInputHash } from '../lib/server/post-idempotency.ts';
import { apiError } from '../lib/server/http.ts';
import { createOwnerSession, SESSION_COOKIE_NAME } from '../lib/server/auth/session.ts';
import { GET } from '../app/api/planner-slots/route.ts';
import { PATCH } from '../app/api/library-items/[id]/route.ts';
import { POST } from '../app/api/posts/route.ts';
import { closePublicationQueue } from '../lib/server/scheduler/queue.ts';
import { closeRedisConnection } from '../lib/server/scheduler/redis.ts';
import type { SavePostInput } from '../lib/contracts/planner.ts';
import type { SlotQuery } from '../lib/contracts/swipe-planner.ts';

const owner = 'slot-owner', other = 'slot-other';
const noMirror = { mirrorQueue: async () => undefined };
const native = { skip: process.env.PLANLY_TEST_DB_PGLITE === '1' ? 'Native PostgreSQL required for row-lock proof' : false, timeout: 20_000 };
const query: SlotQuery = { providers: ['telegram'], startDate: '2030-01-01', endDate: '2030-01-01', weekdays: [1,2,3,4,5,6,7], times: ['10:00','18:00'] };
const input: SavePostInput = { title: 'Queue title', baseText: 'Prepared copy', status: 'READY', mediaIds: [], targets: [{ provider: 'telegram', scheduledAt: '2030-01-01T07:00:00Z', textOverride: null }] };
async function server() {
  const mod = await import('../lib/server/planner-slots.ts').catch(() => null);
  assert.ok(mod, 'Planner slot server helpers exist');
  return mod;
}
async function source() { return createLibraryItem(owner, { text: 'Prepared copy', mediaIds: [] }); }
async function options() { const item = await source(); return { ...noMirror, sourceLibraryItemId: item.id, sourceLibraryUpdatedAt: item.updatedAt, requireFreeSlot: true }; }

beforeEach(async () => {
  await getDb().delete(users);
  await getDb().insert(users).values([owner, other].map(id => ({ id, email: id === owner ? process.env.OWNER_EMAIL ?? 'owner@example.test' : `${id}@example.test`, displayName: id })));
  await getDb().insert(socialAccounts).values([
    { id: 'slot-tg', userId: owner, provider: 'TELEGRAM', displayName: 'TG', enabled: true, connectionStatus: 'CONNECTED' },
    { id: 'slot-max', userId: owner, provider: 'MAX', displayName: 'MAX', enabled: true, connectionStatus: 'CONNECTED' },
    { id: 'foreign-tg', userId: other, provider: 'TELEGRAM', displayName: 'Foreign', enabled: true, connectionStatus: 'CONNECTED' },
  ]);
});
after(async () => {
  await getDb().delete(users).where(inArray(users.id, [owner, other]));
  await closePublicationQueue(); await closeRedisConnection(); await closeDb();
});

test('preview uses selected owned accounts and minute occupancy including seconds', async () => {
  const { previewPlannerSlot } = await server();
  await createPost(other, input, noMirror);
  assert.deepEqual(await previewPlannerSlot(owner, query, new Date('2029-12-31T00:00Z')), { scheduledAt: '2030-01-01T07:00:00.000Z' });
  await createPost(owner, { ...input, targets: [{ ...input.targets[0], scheduledAt: '2030-01-01T07:00:30Z' }] }, noMirror);
  assert.deepEqual(await previewPlannerSlot(owner, query, new Date('2029-12-31T00:00Z')), { scheduledAt: '2030-01-01T15:00:00.000Z' });
  assert.equal((await previewPlannerSlot(owner, { ...query, providers: ['max'] }, new Date('2029-12-31'))).scheduledAt, '2030-01-01T07:00:00.000Z');
  assert.equal((await previewPlannerSlot(owner, { ...query, providers: ['telegram','max'] }, new Date('2029-12-31'))).scheduledAt, '2030-01-01T15:00:00.000Z');
});

test('preview rejects disabled/disconnected accounts without foreign fallback', async () => {
  const { previewPlannerSlot } = await server();
  for (const state of [{ enabled: false, connectionStatus: 'CONNECTED' as const }, { enabled: true, connectionStatus: 'DISCONNECTED' as const }]) {
    await getDb().update(socialAccounts).set(state).where(eq(socialAccounts.id, 'slot-tg'));
    await assert.rejects(() => previewPlannerSlot(owner, query), { name: 'PlannerAccountUnavailableError' });
  }
});

test('active targets reserve every publication outcome except latest CANCELLED', async () => {
  const { previewPlannerSlot } = await server();
  const post = await createPost(owner, input, noMirror);
  for (const status of ['SCHEDULED','QUEUED','PUBLISHING','PUBLISHED','FAILED','REQUIRES_RECONNECT','CANCELLED'] as const) {
    await getDb().update(publications).set({ status }).where(eq(publications.postId, post.id));
    assert.equal((await previewPlannerSlot(owner, query, new Date('2029-12-31'))).scheduledAt, status === 'CANCELLED' ? '2030-01-01T07:00:00.000Z' : '2030-01-01T15:00:00.000Z');
  }
  await getDb().update(publications).set({ status: 'FAILED' }).where(eq(publications.postId, post.id));
  await getDb().update(postTargets).set({ active: false }).where(eq(postTargets.postId, post.id));
  assert.equal((await previewPlannerSlot(owner, query, new Date('2029-12-31'))).scheduledAt, '2030-01-01T07:00:00.000Z');
  await getDb().update(postTargets).set({ active: true, scheduledAt: null }).where(eq(postTargets.postId, post.id));
  assert.equal((await previewPlannerSlot(owner, query, new Date('2029-12-31'))).scheduledAt, '2030-01-01T07:00:00.000Z');
});

test('only latest publication controls cancellation; target without history still reserves', async () => {
  const { previewPlannerSlot } = await server();
  const post = await createPost(owner, input, noMirror);
  const [first] = await getDb().select().from(publications);
  await getDb().update(publications).set({ status: 'CANCELLED', createdAt: new Date('2020-01-01') }).where(eq(publications.id, first.id));
  await getDb().insert(publications).values({ id: 'slot-latest', userId: owner, postId: post.id, postTargetId: first.postTargetId,
    provider: 'TELEGRAM', status: 'FAILED', scheduledAt: first.scheduledAt, idempotencyKey: 'slot-latest', createdAt: new Date('2021-01-01') });
  assert.equal((await previewPlannerSlot(owner, query, new Date('2029-12-31'))).scheduledAt, '2030-01-01T15:00:00.000Z');
  await getDb().update(publications).set({ status: 'CANCELLED' }).where(eq(publications.id, 'slot-latest'));
  assert.equal((await previewPlannerSlot(owner, query, new Date('2029-12-31'))).scheduledAt, '2030-01-01T07:00:00.000Z');
  await getDb().delete(publications).where(eq(publications.postId, post.id));
  assert.equal((await previewPlannerSlot(owner, query, new Date('2029-12-31'))).scheduledAt, '2030-01-01T15:00:00.000Z');
});

test('automatic approval requires READY, targets and one shared instant; draft without targets schedules nothing', async () => {
  const opts = await options();
  const invalid: SavePostInput[] = [
    { ...input, status: 'DRAFT' }, { ...input, targets: [] },
    { ...input, targets: [{ ...input.targets[0], scheduledAt: null }] },
    { ...input, targets: [...input.targets, { provider: 'max', scheduledAt: '2030-01-01T15:00:00Z', textOverride: null }] },
  ];
  for (const value of invalid) await assert.rejects(() => createPost(owner, value, opts), { name: 'ZodError' });
  assert.equal((await getDb().select().from(posts)).length, 0); assert.equal((await listLibraryItems(owner))[0].status, 'READY');
  const draft = await createPost(owner, { ...input, status: 'DRAFT', targets: [] }, { ...opts, requireFreeSlot: false });
  assert.equal(draft.status, 'DRAFT'); assert.equal(draft.title, input.title); assert.deepEqual(draft.targets, []);
  assert.deepEqual(await getDb().select().from(publications), []);
});

test('automatic conflict and elapsed slot preserve READY source and create no additional rows', async () => {
  await createPost(owner, input, noMirror);
  const opts = await options();
  await assert.rejects(() => createPost(owner, input, opts), { name: 'PlannerSlotConflictError' });
  assert.equal((await listLibraryItems(owner))[0].status, 'READY');
  assert.equal((await getDb().select().from(posts)).length, 1);
  assert.equal((await getDb().select().from(publications)).length, 1);
  await assert.rejects(() => createPost(owner, { ...input, targets: [{ ...input.targets[0], scheduledAt: '2000-01-01T07:00Z' }] }, opts), { name: 'PlannerSlotConflictError' });
});

test('stale approval and conditional archive preserve edited content and media', async () => {
  const opts = await options();
  await updateLibraryItem(owner, opts.sourceLibraryItemId, { title: 'new title', text: 'new body', mediaIds: [], status: 'READY' });
  await getDb().update(libraryItems).set({ updatedAt: new Date('2031-01-01') }).where(eq(libraryItems.id, opts.sourceLibraryItemId));
  await assert.rejects(() => createPost(owner, input, opts), { name: 'LibrarySourceStaleError' });
  assert.equal(typeof library.archiveLibraryItem, 'function');
  await assert.rejects(() => library.archiveLibraryItem(owner, opts.sourceLibraryItemId, opts.sourceLibraryUpdatedAt), { name: 'LibrarySourceStaleError' });
  const [current] = await listLibraryItems(owner);
  assert.equal(current.title, 'new title'); assert.equal(current.text, 'new body'); assert.equal(current.status, 'READY');
  const archived = await library.archiveLibraryItem(owner, current.id, current.updatedAt);
  assert.equal(archived.status, 'ARCHIVED'); assert.equal(archived.title, current.title); assert.equal(archived.text, current.text); assert.deepEqual(archived.mediaIds, current.mediaIds);
  assert.equal((await getDb().select().from(posts)).length, 0);
  assert.equal((await getDb().select().from(publications)).length, 0);
});

test('source revision advances even when edits share the same clock millisecond', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2029-12-31T00:00:00Z') });
  const opts = await options();
  const edited = await updateLibraryItem(owner, opts.sourceLibraryItemId, { text: 'Updated while card displayed', mediaIds: [], status: 'READY' });
  assert.notEqual(edited.updatedAt, opts.sourceLibraryUpdatedAt);
  await assert.rejects(() => createPost(owner, input, opts), { name: 'LibrarySourceStaleError' });
  await assert.rejects(() => library.archiveLibraryItem(owner, edited.id, opts.sourceLibraryUpdatedAt), { name: 'LibrarySourceStaleError' });
  assert.equal((await listLibraryItems(owner))[0].text, edited.text);
  assert.deepEqual(await getDb().select().from(posts), []);
});

test('queue scheduled approvals enforce connected accounts while legacy manual contract remains', async () => {
  const opts = await options();
  await getDb().update(socialAccounts).set({ enabled: false }).where(eq(socialAccounts.id, 'slot-tg'));
  await assert.rejects(() => createPost(owner, input, { ...opts, requireFreeSlot: false }), { name: 'PlannerAccountUnavailableError' });
  assert.equal((await getDb().select().from(posts)).length, 0);
  await createPost(owner, input, noMirror);
});

test('idempotency and linked-source replay precede elapsed/stale/occupied validation', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2029-12-31T00:00:00Z') });
  const opts = { ...await options(), creationKey: '11111111-1111-4111-8111-111111111111' };
  const created = await createPost(owner, input, opts);
  t.mock.timers.setTime(Date.parse('2031-01-01T00:00:00Z'));
  await getDb().update(libraryItems).set({ updatedAt: new Date('2031-01-01'), status: 'ARCHIVED' }).where(eq(libraryItems.id, opts.sourceLibraryItemId));
  await getDb().update(socialAccounts).set({ enabled: false }).where(eq(socialAccounts.id, 'slot-tg'));
  assert.equal((await createPost(owner, input, opts)).id, created.id);
  assert.equal((await createPost(owner, { ...input, targets: [{ ...input.targets[0], scheduledAt: '2000-01-01T07:00:00Z' }] }, { ...opts, creationKey: undefined })).id, created.id);
  await assert.rejects(() => createPost(owner, input, { ...opts, requireFreeSlot: false }), { name: 'CreationConflictError' });
});

test('API preview requires owner auth and validates query; status-only reject preserves full content', async () => {
  const token = await createOwnerSession(owner);
  const headers = { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`, 'content-type': 'application/json' };
  const url = 'http://planly.test/api/planner-slots?providers=telegram&startDate=2030-01-01&endDate=2030-01-01&weekdays=1,2,3,4,5,6,7&times=10:00,18:00';
  assert.equal((await GET(new Request(url))).status, 401);
  const response = await GET(new Request(url, { headers }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { scheduledAt: '2030-01-01T07:00:00.000Z' });
  assert.equal((await GET(new Request(url.replace('providers=telegram', 'providers=telegram,telegram'), { headers }))).status, 422);
  const item = await createLibraryItem(owner, { title: 'Keep title', text: 'Keep body', mediaIds: [] });
  const archived = await PATCH(new Request('http://planly.test/api/library-items/' + item.id, { method: 'PATCH', headers,
    body: JSON.stringify({ status: 'ARCHIVED', expectedUpdatedAt: item.updatedAt }) }), { params: Promise.resolve({ id: item.id }) });
  assert.equal(archived.status, 200); assert.equal((await archived.json()).text, item.text);
});

test('conditional rejection rejects content-bearing commands rather than bypassing revision guard', async () => {
  const token = await createOwnerSession(owner);
  const item = await source();
  const response = await PATCH(new Request('http://planly.test/api/library-items/' + item.id, { method: 'PATCH', headers: {
    cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`, 'content-type': 'application/json',
  }, body: JSON.stringify({ status: 'ARCHIVED', expectedUpdatedAt: '2000-01-01T00:00:00Z', text: 'destructive stale copy', mediaIds: [] }) }), { params: Promise.resolve({ id: item.id }) });
  assert.equal(response.status, 422);
  assert.deepEqual(await listLibraryItems(owner), [item]);
});

test('POST source options reach transactional slot guard with zero precommit writes', async () => {
  await createPost(owner, input, noMirror);
  const opts = await options();
  const token = await createOwnerSession(owner);
  const response = await POST(new Request('http://planly.test/api/posts', { method: 'POST', headers: {
    cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`, 'content-type': 'application/json', 'idempotency-key': '44444444-4444-4444-8444-444444444444',
  }, body: JSON.stringify({ ...input, sourceLibraryItemId: opts.sourceLibraryItemId, sourceLibraryUpdatedAt: opts.sourceLibraryUpdatedAt, requireFreeSlot: true }) }));
  assert.equal(response.status, 409); assert.equal((await response.json()).code, 'PLANNER_SLOT_CONFLICT');
  assert.equal((await getDb().select().from(posts)).length, 1); assert.equal((await listLibraryItems(owner))[0].status, 'READY');
});

test('source options retain planner context and hashes preserve legacy bytes', async () => {
  const { createHash } = await import('node:crypto');
  const { canonicalCreationInput } = await import('../lib/post-creation.ts');
  const sourceId = 'source';
  const canonical = canonicalCreationInput(input);
  assert.equal(creationInputHash(input), createHash('sha256').update(canonical).digest('hex'));
  assert.equal(creationInputHash(input, sourceId), createHash('sha256').update(JSON.stringify({ canonical, sourceLibraryItemId: sourceId })).digest('hex'));
  assert.equal(createPostSourceSchema.parse({ sourceLibraryItemId: sourceId, requireFreeSlot: true, sourceLibraryUpdatedAt: '2030-01-01T00:00:00Z' }).requireFreeSlot, true);
  assert.equal(createPostSourceSchema.safeParse({ requireFreeSlot: true }).success, false);
  assert.notEqual(creationInputHash(input, sourceId, { requireFreeSlot: true }), creationInputHash(input, sourceId));
});

test('concurrent automatic approvals cannot claim the same minute', native, async () => {
  const opts = await Promise.all([options(), options()]);
  const results = await Promise.allSettled(opts.map(option => createPost(owner, input, option)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const failure = results.find(result => result.status === 'rejected');
  assert.ok(failure && failure.status === 'rejected'); assert.equal(failure.reason.name, 'PlannerSlotConflictError');
  assert.equal((await getDb().select().from(posts)).length, 1);
  assert.equal((await getDb().select().from(publications)).length, 1);
  assert.deepEqual((await listLibraryItems(owner)).map(item => item.status).sort(), ['READY','USED']);
});

test('Composer reschedule and creation wait on the same owner schedule lock', native, async () => {
  const manual = await createPost(owner, { ...input, targets: [{ ...input.targets[0], scheduledAt: '2030-01-01T15:00:00Z' }] }, noMirror);
  const opts = await options();
  const gate = new Client({ connectionString: process.env.DATABASE_URL });
  await gate.connect();
  const pending: Promise<unknown>[] = [];
  try {
    await gate.query('BEGIN'); await gate.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [owner]);
    const pid = (await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    for (const operation of [() => updatePost(owner, manual.id, input, noMirror), () => createPost(owner, input, opts).catch(error => error)]) {
      pending.push(operation());
      let observed = false;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        await gate.query('SELECT pg_stat_clear_snapshot()');
        const waiting = await gate.query("SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock' AND query ILIKE '%users%' AND query ILIKE '%for update%' AND datname=current_database()");
        if (waiting.rows.length >= pending.length) { observed = true; break; } await delay(20);
      }
      assert.ok(observed, `both paths must wait on owner row ${pid}`);
    }
    await gate.query('COMMIT');
    const [, created] = await Promise.all(pending);
    assert.equal((created as Error).name, 'PlannerSlotConflictError');
  } finally { await gate.query('ROLLBACK'); await Promise.allSettled(pending); await gate.end(); }
});

test('planner/source conflicts have explicit precommit HTTP codes', async () => {
  const mod = await server();
  assert.deepEqual(await apiError(new mod.PlannerSlotConflictError()).json(), { error: new mod.PlannerSlotConflictError().message, code: 'PLANNER_SLOT_CONFLICT' });
  assert.equal(apiError(new mod.LibrarySourceStaleError()).status, 409);
});
