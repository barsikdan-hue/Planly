import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { publications, socialAccounts, users } from '../db/schema.ts';
import { reconcilePostPublications } from '../lib/server/publications.ts';
import { applyPublicationQueueChanges, reconcileScheduledJobs } from '../lib/server/scheduler/reconcile.ts';
import { closePublicationQueue, ensurePublicationJob, getPublicationQueue, removePublicationJob } from '../lib/server/scheduler/queue.ts';
import { closeRedisConnection } from '../lib/server/scheduler/redis.ts';
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
after(async () => {
  await getDb().delete(users).where(eq(users.id, owner));
  await closePublicationQueue(); await closeRedisConnection(); await closeDb();
});

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
  assert.equal((await history(post.id))[0]!.status, 'CANCELLED');
  assert.deepEqual(delivered, []);
});

test('edit-first durably cancels old failure and stale duplicate deliveries cannot send', async () => {
  const { post, row } = await failedPublication();
  const changes: { publicationId: string; action: string }[] = [];
  await updatePost(owner, post.id, input('Edit first'), { mirrorQueue: async value => { changes.push(...value); } });
  assert.equal((await history(post.id)).find(item => item.id === row.id)!.status, 'CANCELLED');
  assert.ok(changes.some(item => item.publicationId === row.id && item.action === 'remove'));
  assert.deepEqual(await prepareTemporaryPublicationRetry(row.id, 5, [0]), { scheduled: false });
  await Promise.all([processPublication(row.id, resolver), processPublication(row.id, resolver)]);
  assert.deepEqual(delivered, []);
  await runDuePublications({ userId: owner, resolveConnector: resolver });
  assert.deepEqual(delivered, ['Edit first']);
});

test('retry-first edit reuses the queued row without adding a replacement', async () => {
  const { post, row } = await failedPublication();
  assert.deepEqual(await prepareTemporaryPublicationRetry(row.id, 5, [0]), { scheduled: true, delayMs: 0 });
  await updatePost(owner, post.id, input('Retry first'), options);
  assert.equal((await history(post.id)).length, 1);
  assert.equal((await history(post.id))[0]!.id, row.id);
  await runDuePublications({ userId: owner, resolveConnector: resolver });
  await processPublication(row.id, resolver);
  assert.deepEqual(delivered, ['Retry first']);
});

test('deactivation cancels the failed history and reactivation cannot revive it', async () => {
  const { post, row } = await failedPublication();
  await updatePost(owner, post.id, { ...input(), targets: [] }, options);
  assert.equal((await history(post.id))[0]!.status, 'CANCELLED');
  await updatePost(owner, post.id, input('Reactivated'), options);
  assert.deepEqual(await prepareTemporaryPublicationRetry(row.id, 5, [0]), { scheduled: false });
  await runDuePublications({ userId: owner, resolveConnector: resolver });
  assert.deepEqual(delivered, ['Reactivated']);
});

test('replacement cancellation remains authoritative when Redis cleanup fails', async () => {
  const { post, row } = await failedPublication();
  await updatePost(owner, post.id, input('Cleanup failed'), { mirrorQueue: async () => { throw new Error('fixture queue unavailable'); } });
  assert.equal((await history(post.id)).find(item => item.id === row.id)!.status, 'CANCELLED');
  assert.deepEqual(await processPublication(row.id, resolver), { status: 'CANCELLED', skipped: true });
  await runDuePublications({ userId: owner, resolveConnector: resolver });
  assert.deepEqual(delivered, ['Cleanup failed']);
});

test('direct reconciliation and retry serialize without two deliverable rows', async () => {
  const { post, row } = await failedPublication();
  await Promise.all([reconcilePostPublications(owner, post.id), prepareTemporaryPublicationRetry(row.id, 5, [0])]);
  assert.equal((await history(post.id)).filter(item => ['SCHEDULED', 'QUEUED'].includes(item.status)).length, 1);
  await runDuePublications({ userId: owner, resolveConnector: resolver });
  assert.deepEqual(delivered, ['Original']);
});

test('Redis removes superseded job and repeated restoration preserves one retry and deadline', async () => {
  const { post, row } = await failedPublication();
  const ids = new Set([row.id]);
  try {
    await ensurePublicationJob(row.id, new Date(Date.now() + 600_000));
    await updatePost(owner, post.id, input('Redis replacement'), { mirrorQueue: async changes => {
      for (const change of changes) ids.add(change.publicationId);
      await applyPublicationQueueChanges(changes);
    } });
    assert.equal(await getPublicationQueue().getJob(row.id), undefined);
    const replacement = (await history(post.id)).find(item => item.id !== row.id)!;
    assert.ok(await getPublicationQueue().getJob(replacement.id));
    // A safe rejection of the replacement must retain its own provider deadline.
    rejectNext = true;
    await processPublication(replacement.id, resolver);
    const now = new Date();
    await prepareTemporaryPublicationRetry(replacement.id, 5, [60_000], 120_000, now);
    await reconcileScheduledJobs();
    const first = await getPublicationQueue().getJob(replacement.id);
    assert.ok(first);
    const deadline = first.timestamp + Number(first.opts.delay);
    assert.ok(deadline >= now.getTime() + 120_000 && deadline <= now.getTime() + 120_100);
    assert.deepEqual(await prepareTemporaryPublicationRetry(replacement.id, 5, [0], 0, new Date(now.getTime() + 1000)), { scheduled: false });
    await reconcileScheduledJobs();
    const second = await getPublicationQueue().getJob(replacement.id);
    assert.ok(second);
    const restoredDeadline = second.timestamp + Number(second.opts.delay);
    assert.ok(restoredDeadline >= now.getTime() + 120_000 && restoredDeadline <= now.getTime() + 120_100);
    assert.equal((await history(post.id)).find(item => item.id === replacement.id)!.nextRetryAt?.getTime(), now.getTime() + 120_000);
    assert.equal((await getPublicationQueue().getJobs(['wait', 'delayed', 'active'])).filter(job => job.id === replacement.id).length, 1);
  } finally {
    for (const id of ids) await removePublicationJob(id);
  }
});

for (const outcome of ['PUBLISHED', 'PUBLISHING', 'REQUIRES_RECONNECT', 'AMBIGUOUS', 'CANCELLED'] as const) {
  test(`retry never resurrects protected ${outcome} outcome`, async () => {
    const { post, row } = await failedPublication();
    await getDb().update(publications).set({
      status: outcome === 'AMBIGUOUS' ? 'FAILED' : outcome,
      providerErrorCode: outcome === 'AMBIGUOUS' ? 'AMBIGUOUS_DELIVERY' : 'protected-fixture',
      providerRemoteId: outcome === 'PUBLISHED' ? 'protected-receipt' : null,
    }).where(eq(publications.id, row.id));
    const before = (await history(post.id))[0];
    assert.deepEqual(await prepareTemporaryPublicationRetry(row.id, 5, [0]), { scheduled: false });
    assert.deepEqual((await history(post.id))[0], before);
    assert.deepEqual(delivered, []);
  });
}

test('unsafe receipt on another target cannot suppress the current target retry', async () => {
  await getDb().insert(socialAccounts).values({ id: 'retry-race-max', userId: owner, provider: 'MAX', displayName: 'Other target', providerAccountId: 'fixture-max' });
  const post = await createPost(owner, { ...input(), targets: [...input().targets, { provider: 'max', textOverride: null, scheduledAt: due }] }, options);
  const rows = await history(post.id);
  const tg = rows.find(row => row.provider === 'TELEGRAM')!;
  const max = rows.find(row => row.provider === 'MAX')!;
  await processPublication(tg.id, resolver);
  await getDb().update(publications).set({ status: 'PUBLISHED', providerRemoteId: 'other-receipt' }).where(eq(publications.id, max.id));
  assert.deepEqual(await prepareTemporaryPublicationRetry(tg.id, 5, [0]), { scheduled: true, delayMs: 0 });
  await runDuePublications({ userId: owner, resolveConnector: resolver });
  assert.deepEqual(delivered, ['Original']);
  assert.equal((await history(post.id)).find(row => row.id === max.id)!.providerRemoteId, 'other-receipt');
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
