import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { mediaAssets, publications, socialAccounts, users } from '../db/schema.ts';
import { createPost, listPlannerPosts, updatePost } from '../lib/server/posts.ts';
import { apiError } from '../lib/server/http.ts';
import { runDuePublications } from '../lib/server/scheduler/tick.ts';
import { processPublicationJob } from '../lib/server/scheduler/worker.ts';
import type { PublicationJob } from '../lib/server/scheduler/queue.ts';
import type { Job } from 'bullmq';
import { createOwnerSession, SESSION_COOKIE_NAME } from '../lib/server/auth/session.ts';
import { POST as postsPOST } from '../app/api/posts/route.ts';

const ownerId = 'content-owner';
const due = '2030-01-01T09:00:00.000Z';
const target = (provider: 'telegram' | 'max', textOverride: string | null = null) => ({ provider, textOverride, scheduledAt: due });
let mirrored = 0;
const options = { mirrorQueue: async () => { mirrored += 1; } };

beforeEach(async () => {
  const db = getDb();
  await db.delete(users);
  await db.insert(users).values({ id: ownerId, email: process.env.OWNER_EMAIL ?? 'owner@example.test', displayName: 'Content' });
  await db.insert(socialAccounts).values(['TELEGRAM', 'MAX'].map(provider => ({
    id: `content-${provider}`, userId: ownerId, provider: provider as 'TELEGRAM' | 'MAX', displayName: provider,
  })));
  mirrored = 0;
});
after(closeDb);

test('overlong scheduled Telegram text is rejected before persistence and queue mirroring', async () => {
  await assert.rejects(() => createPost(ownerId, {
    baseText: 'x'.repeat(4097), status: 'READY', mediaIds: [], targets: [target('telegram')],
  }, options), /Telegram.*4096/i);
  assert.deepEqual(await listPlannerPosts(ownerId), []);
  assert.deepEqual(await getDb().select().from(publications), []);
  assert.equal(mirrored, 0);
});

test('one invalid target rejects the complete update with actionable 422 and keeps old state', async () => {
  const created = await createPost(ownerId, { baseText: 'original', status: 'DRAFT', mediaIds: [], targets: [] }, options);
  mirrored = 0;
  let response: Response | undefined;
  try {
    await updatePost(ownerId, created.id, {
      baseText: 'new text', status: 'READY', mediaIds: [], targets: [target('telegram'), target('max', 'x'.repeat(4001))],
    }, options);
  } catch (error) { response = apiError(error); }
  assert.equal(response?.status, 422);
  assert.match((await response!.json()).error, /MAX.*4000/i);
  assert.equal((await listPlannerPosts(ownerId))[0].baseText, 'original');
  assert.deepEqual(await getDb().select().from(publications), []);
  assert.equal(mirrored, 0);
});

test('owned media metadata prevents invalid captions, formats and image dimensions before queueing', async () => {
  await getDb().insert(mediaAssets).values([
    { id: 'content-photo', userId: ownerId, storageKey: 'content/photo', originalName: 'p.png', mimeType: 'image/png', byteSize: 20, checksum: 'p', width: 8000, height: 1000 },
    { id: 'content-webp', userId: ownerId, storageKey: 'content/webp', originalName: 'p.webp', mimeType: 'image/webp', byteSize: 20, checksum: 'w', width: 100, height: 100 },
  ]);
  for (const input of [
    { baseText: 'x'.repeat(1025), status: 'READY' as const, mediaIds: ['content-photo'], targets: [target('telegram')] },
    { baseText: '', status: 'READY' as const, mediaIds: ['content-webp'], targets: [target('telegram')] },
    { baseText: '', status: 'READY' as const, mediaIds: ['content-photo'], targets: [target('max')] },
  ]) await assert.rejects(() => createPost(ownerId, input, options), /Telegram|MAX/i);
  assert.deepEqual(await listPlannerPosts(ownerId), []);
  assert.equal(mirrored, 0);
});

test('unscheduled draft remains permissive and a valid override schedules independently of long base text', async () => {
  const draft = await createPost(ownerId, { baseText: 'x'.repeat(5000), status: 'DRAFT', mediaIds: [], targets: [{ ...target('telegram'), scheduledAt: null }] }, options);
  assert.equal(draft.baseText.length, 5000);
  assert.deepEqual(await getDb().select().from(publications), []);
  const scheduled = await updatePost(ownerId, draft.id, {
    baseText: draft.baseText, status: 'READY', mediaIds: [], targets: [target('telegram', 'valid override')],
  }, options);
  assert.equal(scheduled.targets[0].textOverride, 'valid override');
  assert.equal((await getDb().select().from(publications).where(eq(publications.postId, draft.id))).length, 1);
});

test('scheduled DRAFT and empty override cannot bypass provider validation', async () => {
  await assert.rejects(() => createPost(ownerId, {
    baseText: 'x'.repeat(4097), status: 'DRAFT', mediaIds: [], targets: [target('telegram')],
  }, options), /Telegram.*4096/i);
  await assert.rejects(() => createPost(ownerId, {
    baseText: 'valid base', status: 'READY', mediaIds: [], targets: [target('telegram', '')],
  }, options), /Telegram/i);
  assert.deepEqual(await listPlannerPosts(ownerId), []);
  assert.equal(mirrored, 0);
});

test('owner POST route returns actionable 422 without durable writes', async () => {
  const token = await createOwnerSession(ownerId);
  const response = await postsPOST(new Request('http://planly.test/api/posts', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` },
    body: JSON.stringify({ baseText: 'x'.repeat(4001), status: 'READY', mediaIds: [], targets: [target('max')] }),
  }));
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.match(body.error, /MAX.*4000/i);
  assert.equal(body.code, 'MAX_CONTENT');
  assert.deepEqual(await listPlannerPosts(ownerId), []);
  assert.deepEqual(await getDb().select().from(publications), []);
});

for (const execution of ['tick', 'worker'] as const) test(`${execution} leaves provider VALIDATION terminal without an automatic retry`, async () => {
  const created = await createPost(ownerId, { baseText: 'valid', status: 'READY', mediaIds: [], targets: [target('telegram')] }, options);
  const [publication] = await getDb().select().from(publications).where(eq(publications.postId, created.id));
  let deliveries = 0;
  const resolver = () => ({ provider: 'TELEGRAM' as const, async publish() {
    deliveries += 1;
    return { ok: false as const, errorType: 'VALIDATION' as const, code: 'TELEGRAM_400', message: 'Rejected content' };
  } });
  const run = execution === 'tick'
    ? () => runDuePublications({ now: new Date('2030-01-02T00:00:00Z'), resolveConnector: resolver })
    : () => processPublicationJob({ data: { publicationId: publication.id }, opts: { attempts: 5 } } as Job<PublicationJob>, resolver);
  await run();
  await run();
  const [stored] = await getDb().select().from(publications).where(eq(publications.id, publication.id));
  assert.equal(deliveries, 1);
  assert.equal(stored.status, 'FAILED');
  assert.equal(stored.normalizedErrorType, 'VALIDATION');
  assert.equal(stored.attemptCount, 1);
  assert.equal(stored.nextRetryAt, null);
});
