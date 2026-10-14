import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { users, socialAccounts, posts, postTargets, publications } from '../db/schema.ts';
import { processPublication } from '../lib/server/scheduler/processor.ts';
import { runDuePublications } from '../lib/server/scheduler/tick.ts';
import { reconcileScheduledJobs } from '../lib/server/scheduler/reconcile.ts';
import { prepareTemporaryPublicationRetry } from '../lib/server/scheduler/retry.ts';

const database = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['localhost', '127.0.0.1'].includes(database.hostname) && database.pathname === '/planly_test', 'isolated loopback test database required');
const owner = 'crash-characterization-owner';
const id = 'crash-characterization-publication';
const due = new Date('2020-01-01T00:00:00Z');
async function row() { return (await getDb().select().from(publications).where(eq(publications.id, id)))[0]; }
beforeEach(async () => {
  // All fixtures cascade only from this isolated test owner.
  await getDb().delete(users).where(eq(users.id, owner));
  await getDb().insert(users).values({ id: owner, email: 'crash@example.test', displayName: 'Crash fixture' });
  await getDb().insert(socialAccounts).values({ id: `${owner}-tg`, userId: owner, provider: 'TELEGRAM', providerAccountId: '-100123', displayName: 'Fake Telegram' });
  await getDb().insert(posts).values({ id: `${owner}-post`, userId: owner, baseText: 'Isolated crash fixture', status: 'READY' });
  await getDb().insert(postTargets).values({ id: `${owner}-target`, postId: `${owner}-post`, socialAccountId: `${owner}-tg`, active: true, scheduledAt: due });
  await getDb().insert(publications).values({ id, userId: owner, postId: `${owner}-post`, postTargetId: `${owner}-target`, provider: 'TELEGRAM', status: 'QUEUED', scheduledAt: due, idempotencyKey: id });
});
after(async () => { await getDb().delete(users).where(eq(users.id, owner)); await closeDb(); });

async function abruptExit(boundary: string) {
  const child = fork(new URL('./helpers/publication-crash-child.ts', import.meta.url), [id, boundary], {
    execArgv: ['--experimental-strip-types'], silent: true,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: 'test' },
  });
  const messages: unknown[] = [];
  child.on('message', message => messages.push(message));
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Crash child did not exit')); }, 15_000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', exitCode => { clearTimeout(timeout); resolve(exitCode); });
    });
    assert.equal(code, 70);
    assert.deepEqual(messages, boundary === 'before-handoff' ? [] : [{ boundary, fakeSends: 1 }]);
  } finally { if (child.exitCode === null) child.kill(); }
}

for (const boundary of ['before-handoff', 'after-fake-acceptance']) test(`characterizes durable PUBLISHING after abrupt exit ${boundary}`, async () => {
  await abruptExit(boundary);
  const crashed = await row();
  assert.equal(crashed.status, 'PUBLISHING'); assert.equal(crashed.attemptCount, 1);
  assert.ok(crashed.lastAttemptAt); assert.equal(crashed.providerRemoteId, null);
  assert.equal(crashed.providerErrorCode, null); assert.equal(crashed.normalizedErrorType, null);
  let calls = 0;
  const resolver = () => ({ provider: 'TELEGRAM' as const, async publish() { calls++; return { ok: true as const, remoteId: 'forbidden-resend' }; } });
  assert.deepEqual(await runDuePublications({ userId: owner, resolveConnector: resolver }), { scanned: 0, processed: 0, published: 0, skipped: 0, failed: 0 });
  const enqueued: string[] = [];
  await reconcileScheduledJobs(new Date(), { async ensurePublicationJob(publicationId) { enqueued.push(publicationId); return true; }, async removePublicationJob() {} });
  assert.ok(!enqueued.includes(id)); assert.equal((await row()).status, 'PUBLISHING');
  assert.deepEqual(await prepareTemporaryPublicationRetry(id, 5, [0]), { scheduled: false });
  // Explicit retained-job redelivery/re-entry diagnoses ambiguity but never sends.
  assert.equal((await processPublication(id, resolver)).status, 'FAILED');
  const diagnosed = await row();
  assert.equal(diagnosed.providerErrorCode, 'AMBIGUOUS_DELIVERY'); assert.equal(diagnosed.normalizedErrorType, 'PERMANENT');
  assert.equal(diagnosed.attemptCount, 1); assert.equal(diagnosed.nextRetryAt, null); assert.equal(calls, 0);
  assert.deepEqual(await prepareTemporaryPublicationRetry(id, 5, [0]), { scheduled: false });
  assert.equal((await processPublication(id, resolver)).skipped, true); assert.equal(calls, 0);
});
