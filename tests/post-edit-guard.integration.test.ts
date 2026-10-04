import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { and, asc, eq } from 'drizzle-orm';
import { Client } from 'pg';
import { closeDb, getDb } from '../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, publications, socialAccounts, users } from '../db/schema.ts';
import { createPost, listPlannerPosts, updatePost } from '../lib/server/posts.ts';
import { apiError } from '../lib/server/http.ts';
import { createOwnerSession, SESSION_COOKIE_NAME } from '../lib/server/auth/session.ts';
import { resetServerEnvForTests } from '../lib/server/env.ts';
import { processPublication } from '../lib/server/scheduler/processor.ts';
import { PATCH } from '../app/api/posts/[id]/route.ts';
import type { PostDto, SavePostInput } from '../lib/contracts/planner.ts';

const owner = 'post-edit-guard-owner';
const previousOwnerEmail = process.env.OWNER_EMAIL;
const due = '2030-01-01T09:00:00.000Z';
const original: SavePostInput = { title: null, baseText: 'Text confirmed by the provider', status: 'READY', mediaIds: [],
  targets: [{ provider: 'telegram', textOverride: null, scheduledAt: due }] };
let mirrored = 0;
const options = { mirrorQueue: async () => { mirrored += 1; } };

before(() => {
  process.env.OWNER_EMAIL = 'post-edit-guard@example.test';
  resetServerEnvForTests();
});
beforeEach(async () => {
  const db = getDb();
  await db.delete(users).where(eq(users.id, owner));
  await db.insert(users).values({ id: owner, email: 'post-edit-guard@example.test', displayName: 'Edit guard fixture' });
  await db.insert(socialAccounts).values(['TELEGRAM', 'MAX'].map(provider => ({
    id: `edit-guard-${provider}`, userId: owner, provider: provider as 'TELEGRAM' | 'MAX', displayName: provider,
  })));
  await db.insert(mediaAssets).values(['edit-first', 'edit-second'].map(id => ({
    id, userId: owner, storageKey: id, originalName: `${id}.png`, mimeType: 'image/png', byteSize: 10,
    checksum: id, width: 100, height: 100,
  })));
  mirrored = 0;
});
after(async () => {
  await getDb().delete(users).where(eq(users.id, owner));
  await closeDb();
  if (previousOwnerEmail === undefined) delete process.env.OWNER_EMAIL;
  else process.env.OWNER_EMAIL = previousOwnerEmail;
  resetServerEnvForTests();
});

async function snapshot(postId: string) {
  const db = getDb();
  return {
    posts: await db.select().from(posts).where(eq(posts.id, postId)),
    targets: await db.select().from(postTargets).where(eq(postTargets.postId, postId)).orderBy(asc(postTargets.id)),
    media: await db.select().from(postMedia).where(eq(postMedia.postId, postId)).orderBy(asc(postMedia.position)),
    publications: await db.select().from(publications).where(eq(publications.postId, postId)).orderBy(asc(publications.id)),
  };
}

async function seedPublished(input: SavePostInput = original) {
  const post = await createPost(owner, input, options);
  await getDb().update(publications).set({ status: 'PUBLISHED', providerRemoteId: 'confirmed-remote-41',
    providerUrl: 'https://fixture.invalid/posts/41', publishedAt: new Date('2020-01-01T00:00:00Z') })
    .where(and(eq(publications.postId, post.id), eq(publications.provider, 'TELEGRAM')));
  mirrored = 0;
  return post;
}

async function expectBlocked(postId: string, input: SavePostInput) {
  const beforeState = await snapshot(postId);
  let failure: unknown;
  try { await updatePost(owner, postId, input, options); } catch (error) { failure = error; }
  assert.ok(failure, 'editing publication history must reject before changing durable content');
  const response = apiError(failure);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'POST_EDIT_BLOCKED');
  assert.deepEqual(await snapshot(postId), beforeState, 'rejection must retain content, target/media rows and remote receipt');
  assert.equal(mirrored, 0, 'rejected edits must not mirror publication queue changes');
}

test('authenticated PATCH cannot pair changed text with the original published receipt', async () => {
  const post = await seedPublished();
  const beforeState = await snapshot(post.id);
  const token = await createOwnerSession(owner);
  const response = await PATCH(new Request(`http://planly.test/api/posts/${post.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` },
    body: JSON.stringify({ ...original, baseText: 'Text never sent to the provider' }),
  }), { params: Promise.resolve({ id: post.id }) });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'POST_EDIT_BLOCKED');
  assert.deepEqual(await snapshot(post.id), beforeState);
});

const changes: Array<[string, (input: SavePostInput) => SavePostInput]> = [
  ['title', input => ({ ...input, title: 'Changed title' })],
  ['text', input => ({ ...input, baseText: 'Changed body' })],
  ['override', input => ({ ...input, targets: [{ ...input.targets[0]!, textOverride: 'Changed variant' }] })],
  ['schedule', input => ({ ...input, targets: [{ ...input.targets[0]!, scheduledAt: '2030-02-01T09:00:00Z' }] })],
  ['status', input => ({ ...input, status: 'DRAFT' })],
  ['remove target', input => ({ ...input, targets: [] })],
  ['add target', input => ({ ...input, targets: [...input.targets, { provider: 'max', textOverride: null, scheduledAt: due }] })],
  ['media order', input => ({ ...input, mediaIds: [...input.mediaIds].reverse() })],
];
for (const [label, change] of changes) test(`published post rejects ${label} mutation atomically`, async () => {
  const input = { ...original, mediaIds: ['edit-first', 'edit-second'] };
  const post = await seedPublished(input);
  await expectBlocked(post.id, change(input));
});

for (const [status, providerErrorCode] of [
  ['PUBLISHING', null], ['REQUIRES_RECONNECT', 'TELEGRAM_401'], ['FAILED', 'AMBIGUOUS_DELIVERY'],
] as const) test(`${status}/${providerErrorCode ?? 'in flight'} cannot be edited into a new apparent publication`, async () => {
  const post = await createPost(owner, original, options);
  await getDb().update(publications).set({ status, providerErrorCode }).where(eq(publications.postId, post.id));
  mirrored = 0;
  await expectBlocked(post.id, { ...original, baseText: 'Changed while outcome is protected' });
});

test('one published target blocks changes to the remaining scheduled target', async () => {
  const input: SavePostInput = { ...original, targets: [...original.targets, { provider: 'max', textOverride: null, scheduledAt: due }] };
  const post = await seedPublished(input);
  const current = (await listPlannerPosts(owner))[0] as PostDto & { editBlockedReason?: string | null };
  assert.equal(current.targets.find(target => target.provider === 'telegram')?.publication?.status, 'PUBLISHED');
  assert.equal(current.targets.find(target => target.provider === 'max')?.publication?.status, 'SCHEDULED');
  assert.equal(typeof current.editBlockedReason, 'string', 'the UI needs authoritative edit capability for mixed targets');
  await expectBlocked(post.id, { ...input, targets: [input.targets[0]!, { ...input.targets[1]!, textOverride: 'New MAX text' }] });
});

test('inactive target history still blocks edits and is exposed as a post-level reason', async () => {
  const post = await seedPublished();
  await getDb().update(postTargets).set({ active: false }).where(eq(postTargets.postId, post.id));
  const current = (await listPlannerPosts(owner))[0] as PostDto & { editBlockedReason?: string | null };
  assert.deepEqual(current.targets, []);
  assert.equal(typeof current.editBlockedReason, 'string', 'latest active-target DTOs must not hide immutable history');
  await expectBlocked(post.id, { ...original, targets: [], baseText: 'New text hiding old receipt' });
});

test('exact published PATCH replay is a no-op, including timestamps and queue mirroring', async () => {
  const input: SavePostInput = { ...original, targets: [...original.targets, { provider: 'max', textOverride: 'MAX variant', scheduledAt: due }] };
  const post = await seedPublished(input);
  await getDb().update(posts).set({ updatedAt: new Date(0) }).where(eq(posts.id, post.id));
  await getDb().update(postTargets).set({ updatedAt: new Date(0) }).where(eq(postTargets.postId, post.id));
  const beforeState = await snapshot(post.id);
  // Provider order and equivalent ISO timezone spelling are not content changes.
  const replay = { ...input, targets: [...input.targets].reverse().map(target => ({ ...target, scheduledAt: '2030-01-01T12:00:00+03:00' })) };
  const result = await updatePost(owner, post.id, replay, options);
  assert.equal(result.id, post.id);
  assert.deepEqual(await snapshot(post.id), beforeState);
  assert.equal(mirrored, 0);
});

test('draft content and unexecuted schedule remain editable with stable publication identity', async () => {
  const draft = await createPost(owner, { ...original, status: 'DRAFT', targets: [] }, options);
  const edited = await updatePost(owner, draft.id, { ...original, baseText: 'Edited draft', status: 'DRAFT', targets: [] }, options);
  assert.equal(edited.baseText, 'Edited draft');
  const scheduled = await updatePost(owner, draft.id, { ...original, baseText: 'Scheduled version' }, options);
  const beforeRows = await getDb().select().from(publications).where(eq(publications.postId, draft.id));
  const moved = await updatePost(owner, draft.id, { ...original, baseText: 'Corrected before sending',
    targets: [{ ...original.targets[0]!, scheduledAt: '2030-02-01T09:00:00Z' }] }, options);
  const afterRows = await getDb().select().from(publications).where(eq(publications.postId, draft.id));
  assert.equal(moved.baseText, 'Corrected before sending');
  assert.equal(moved.targets[0]!.id, scheduled.targets[0]!.id);
  assert.equal(afterRows.length, 1);
  assert.equal(afterRows[0]!.id, beforeRows[0]!.id);
  assert.equal(afterRows[0]!.scheduledAt?.toISOString(), '2030-02-01T09:00:00.000Z');
});

test('processor claim before PATCH keeps the content handed to the provider immutable', async () => {
  const post = await createPost(owner, original, options);
  const [publication] = await getDb().select().from(publications).where(eq(publications.postId, post.id));
  let entered!: () => void;
  let release!: () => void;
  const publishing = new Promise<void>(resolve => { entered = resolve; });
  const finish = new Promise<void>(resolve => { release = resolve; });
  let sentText = '';
  const delivery = processPublication(publication!.id, () => ({ provider: 'TELEGRAM', async publish(input) {
    sentText = input.text; entered(); await finish;
    return { ok: true, remoteId: 'claim-first-remote' };
  } }));
  try {
    await publishing;
    mirrored = 0;
    await expectBlocked(post.id, { ...original, baseText: 'Changed after provider handoff' });
  } finally { release(); await delivery; }
  assert.equal(sentText, 'Text confirmed by the provider');
  assert.equal((await listPlannerPosts(owner))[0]!.baseText, 'Text confirmed by the provider');
});

// PGlite's single backend cannot prove contention between database sessions.
// Normal CI uses native PostgreSQL and runs this test without an opt-in flag.
test('native PostgreSQL edit lock serializes the real processor claim before content is read', {
  skip: process.env.PLANLY_TEST_DB_PGLITE === '1' ? 'PGlite does not prove multi-session row locking' : false,
  timeout: 15_000,
}, async () => {
  const post = await createPost(owner, original, options);
  const [publication] = await getDb().select().from(publications).where(eq(publications.postId, post.id));
  const gate = new Client({ connectionString: process.env.DATABASE_URL });
  await gate.connect();
  const gateKey = 782143;
  let update: ReturnType<typeof updatePost> | undefined;
  let delivery: ReturnType<typeof processPublication> | undefined;
  let deliveryFinished = false;
  let sentText = '';
  const waitFor = async (condition: () => Promise<boolean>, message: string) => {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (await condition()) return;
      if (deliveryFinished) assert.fail('processor escaped the editor transaction lock before it committed');
      await delay(20);
    }
    assert.fail(message);
  };
  try {
    await gate.query('SELECT pg_advisory_lock($1)', [gateKey]);
    // A test-owned trigger pauses the real update at its first post write. The
    // production code must already hold publication locks before reaching it.
    await gate.query(`CREATE FUNCTION edit_guard_test_pause() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.user_id = 'post-edit-guard-owner' THEN PERFORM pg_advisory_xact_lock(782143); END IF; RETURN NEW; END $$`);
    await gate.query('CREATE TRIGGER edit_guard_test_pause BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION edit_guard_test_pause()');
    const gatePid = (await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    update = updatePost(owner, post.id, { ...original, baseText: 'Committed before the claim' }, options);
    let editorPid: number | undefined;
    await waitFor(async () => {
      const waiting = await gate.query('SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))', [gatePid]);
      editorPid = waiting.rows[0]?.pid;
      return !!editorPid;
    }, 'editor did not reach the paused database write');
    delivery = processPublication(publication!.id, () => ({ provider: 'TELEGRAM', async publish(input) {
      sentText = input.text;
      return { ok: true, remoteId: 'edit-first-remote' };
    } })).finally(() => { deliveryFinished = true; });
    await waitFor(async () => (await gate.query(
      'SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))', [editorPid],
    )).rows.length > 0, 'processor claim did not wait for the editor publication locks');
    await gate.query('SELECT pg_advisory_unlock($1)', [gateKey]);
    await update;
    await delivery;
    assert.equal(sentText, 'Committed before the claim');
    const current = (await listPlannerPosts(owner))[0]!;
    assert.equal(current.baseText, sentText);
    assert.equal(current.targets[0]!.publication?.remoteId, 'edit-first-remote');
  } finally {
    await gate.query('SELECT pg_advisory_unlock($1)', [gateKey]);
    await Promise.allSettled([update, delivery].filter(Boolean));
    await gate.query('DROP TRIGGER IF EXISTS edit_guard_test_pause ON posts');
    await gate.query('DROP FUNCTION IF EXISTS edit_guard_test_pause()');
    await gate.end();
  }
});
