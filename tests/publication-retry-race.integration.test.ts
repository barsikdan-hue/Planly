import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { publications, socialAccounts, users } from '../db/schema.ts';
import { createPost, updatePost } from '../lib/server/posts.ts';
import { processPublication } from '../lib/server/scheduler/processor.ts';
import { prepareTemporaryPublicationRetry } from '../lib/server/scheduler/retry.ts';
import { runDuePublications } from '../lib/server/scheduler/tick.ts';
import type { SavePostInput } from '../lib/contracts/planner.ts';
import type { ConnectorResolver } from '../lib/server/connectors/types.ts';

const owner = 'retry-race-owner';
const due = '2020-01-01T09:00:00.000Z';
const options = { mirrorQueue: async () => undefined };
let rejectNext = true;
let delivered: string[] = [];
const resolver: ConnectorResolver = () => ({ provider: 'TELEGRAM', async publish(input) {
  if (rejectNext) {
    rejectNext = false;
    return { ok: false, errorType: 'TEMPORARY', code: 'TELEGRAM_429', message: 'Safe provider rejection' };
  }
  delivered.push(input.text);
  return { ok: true, remoteId: `fixture-${delivered.length}` };
} });
function input(text = 'Original', status: SavePostInput['status'] = 'READY'): SavePostInput {
  return { baseText: text, status, mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: due }] };
}
async function failedPublication() {
  const post = await createPost(owner, input(), options);
  const [row] = await getDb().select().from(publications).where(eq(publications.postId, post.id));
  assert.ok(row);
  const result = await processPublication(row.id, resolver);
  assert.equal(result.errorType, 'TEMPORARY');
  return { post, row };
}
async function history(postId: string) {
  return getDb().select().from(publications).where(eq(publications.postId, postId));
}
beforeEach(async () => {
  const db = getDb();
  await db.delete(users).where(eq(users.id, owner));
  await db.insert(users).values({ id: owner, email: 'retry-race@example.test', displayName: 'Retry fixture' });
  await db.insert(socialAccounts).values({ id: 'retry-race-tg', userId: owner, provider: 'TELEGRAM',
    displayName: 'Fixture', providerAccountId: '-100fixture' });
  rejectNext = true; delivered = [];
});
after(async () => { await getDb().delete(users).where(eq(users.id, owner)); await closeDb(); });

test('edit between temporary rejection and retry delivers edited content only once', async () => {
  const { post, row } = await failedPublication();
  await updatePost(owner, post.id, input('Edited'), options);
  await prepareTemporaryPublicationRetry(row.id, 5, [0]);
  await runDuePublications({ userId: owner, resolveConnector: resolver });
  assert.deepEqual(delivered, ['Edited'], 'The stale retry and replacement must not both deliver');
  assert.equal((await history(post.id)).filter(item => item.status === 'PUBLISHED').length, 1);
});

test('superseded temporary failure is not requeued after replacement is published', async () => {
  const { post, row } = await failedPublication();
  await updatePost(owner, post.id, input('Replacement'), options);
  await runDuePublications({ userId: owner, resolveConnector: resolver });
  assert.deepEqual(await prepareTemporaryPublicationRetry(row.id, 5, [0]), { scheduled: false });
  await runDuePublications({ userId: owner, resolveConnector: resolver });
  assert.deepEqual(delivered, ['Replacement']);
});

test('draft downgrade during retry gap cannot resurrect a failed job', async () => {
  const { post, row } = await failedPublication();
  await updatePost(owner, post.id, input('Draft', 'DRAFT'), options);
  assert.deepEqual(await prepareTemporaryPublicationRetry(row.id, 5, [0]), { scheduled: false });
  assert.equal((await history(post.id))[0]!.status, 'FAILED');
  assert.deepEqual(delivered, []);
});

test('unchanged temporary failure retries once and respects its deadline', async () => {
  const { post, row } = await failedPublication();
  const now = new Date();
  assert.deepEqual(await prepareTemporaryPublicationRetry(row.id, 5, [60_000], 120_000, now), { scheduled: true, delayMs: 120_000 });
  await runDuePublications({ userId: owner, now: new Date(now.getTime() + 119_000), resolveConnector: resolver });
  assert.deepEqual(delivered, []);
  await runDuePublications({ userId: owner, now: new Date(now.getTime() + 121_000), resolveConnector: resolver });
  assert.deepEqual(delivered, ['Original']);
  assert.equal((await history(post.id))[0]!.attemptCount, 2);
});

test('repeated retry preparation does not move an already queued deadline', async () => {
  const { post, row } = await failedPublication();
  const now = new Date();
  await prepareTemporaryPublicationRetry(row.id, 5, [60_000], 0, now);
  assert.deepEqual(await prepareTemporaryPublicationRetry(row.id, 5, [0], 0, now), { scheduled: false });
  assert.equal((await history(post.id))[0]!.nextRetryAt?.getTime(), now.getTime() + 60_000);
});

test('retry preparation cannot resurrect a published receipt', async () => {
  const { post, row } = await failedPublication();
  await prepareTemporaryPublicationRetry(row.id, 5, [0]);
  await runDuePublications({ userId: owner, resolveConnector: resolver });
  assert.deepEqual(await prepareTemporaryPublicationRetry(row.id, 5, [0]), { scheduled: false });
  assert.equal((await history(post.id))[0]!.status, 'PUBLISHED');
  assert.deepEqual(delivered, ['Original']);
});

test('concurrent edit and retry leave only one deliverable publication', async () => {
  const { post, row } = await failedPublication();
  await Promise.all([
    updatePost(owner, post.id, input('Concurrent edit'), options),
    prepareTemporaryPublicationRetry(row.id, 5, [0]),
  ]);
  const open = (await history(post.id)).filter(item => ['SCHEDULED', 'QUEUED'].includes(item.status));
  assert.equal(open.length, 1);
  await runDuePublications({ userId: owner, resolveConnector: resolver });
  assert.deepEqual(delivered, ['Concurrent edit']);
});

test('safe historical row with matching timestamp cannot suppress the current retry', async () => {
  const { post, row } = await failedPublication();
  // Millisecond timestamps are not a causal ordering of distinct requests.
  // An older cancelled row can share a timestamp with the current creation.
  await getDb().insert(publications).values({
    id: 'retry-race-safe-history', userId: owner, postId: post.id,
    postTargetId: row.postTargetId, provider: 'TELEGRAM', status: 'CANCELLED',
    scheduledAt: new Date(due), idempotencyKey: 'retry-race-safe-history',
    createdAt: row.createdAt, updatedAt: row.createdAt,
  });
  assert.deepEqual(await prepareTemporaryPublicationRetry(row.id, 5, [0]), { scheduled: true, delayMs: 0 });
  await runDuePublications({ userId: owner, resolveConnector: resolver });
  assert.deepEqual(delivered, ['Original']);
});
