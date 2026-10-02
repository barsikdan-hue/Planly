import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { posts, postTargets, publications, socialAccounts, users } from '../db/schema.ts';
import { createPost } from '../lib/server/posts.ts';
import { closePublicationQueue, getPublicationQueue } from '../lib/server/scheduler/queue.ts';
import { closeRedisConnection } from '../lib/server/scheduler/redis.ts';
import { startPublicationWorker } from '../lib/server/scheduler/worker.ts';
import type { PublishResult, SocialConnector } from '../lib/server/connectors/types.ts';

const ownerId = 'worker-owner';
let publishCalls = 0;
let results: PublishResult[] = [];

const connector: SocialConnector = {
  provider: 'TELEGRAM',
  async publish() {
    publishCalls += 1;
    return results.shift() ?? { ok: true, remoteId: `remote-${publishCalls}` };
  },
};
const resolver = () => connector;

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for scheduler state');
}

async function reset() {
  await closePublicationQueue();
  await closeRedisConnection();
  const db = getDb();
  await db.delete(publications);
  await db.delete(postTargets);
  await db.delete(posts);
  await db.delete(socialAccounts);
  await db.delete(users);
  await db.insert(users).values({ id: ownerId, email: 'worker@example.test', displayName: 'Worker' });
  await db.insert(socialAccounts).values({ id: 'worker-tg', userId: ownerId, provider: 'TELEGRAM', providerAccountId: '-100123', displayName: 'Telegram' });
  publishCalls = 0;
  results = [];
  await getPublicationQueue().obliterate({ force: true });
}

async function schedule(delayMs: number): Promise<string> {
  const post = await createPost(ownerId, {
    baseText: 'scheduled worker test',
    status: 'READY',
    mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: new Date(Date.now() + delayMs).toISOString() }],
  });
  const [publication] = await getDb().select().from(publications).where(eq(publications.postId, post.id));
  assert.ok(publication);
  return publication.id;
}

async function statusOf(id: string) {
  const [row] = await getDb().select().from(publications).where(eq(publications.id, id));
  return row;
}

beforeEach(reset);
after(async () => {
  await closePublicationQueue();
  await closeRedisConnection();
  await closeDb();
});

test('delayed job does not publish early and fires after due time', async () => {
  const runtime = await startPublicationWorker(resolver, { retryDelaysMs: [20, 40, 60, 80], reconcileIntervalMs: 0 });
  try {
    const id = await schedule(250);
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(publishCalls, 0);
    await waitFor(async () => (await statusOf(id))?.status === 'PUBLISHED');
    assert.equal(publishCalls, 1);
  } finally {
    await runtime.close();
  }
});

test('duplicate queue delivery after success does not publish twice', async () => {
  const runtime = await startPublicationWorker(resolver, { retryDelaysMs: [20, 40, 60, 80], reconcileIntervalMs: 0 });
  try {
    const id = await schedule(0);
    await waitFor(async () => (await statusOf(id))?.status === 'PUBLISHED');
    await getPublicationQueue().add('publish', { publicationId: id }, { jobId: `duplicate-${id}` });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(publishCalls, 1);
  } finally {
    await runtime.close();
  }
});

test('worker restart before due time does not lose delayed publication', async () => {
  const first = await startPublicationWorker(resolver, { retryDelaysMs: [20, 40, 60, 80], reconcileIntervalMs: 0 });
  const id = await schedule(350);
  await new Promise(resolve => setTimeout(resolve, 70));
  await first.close();
  assert.equal(publishCalls, 0);

  const second = await startPublicationWorker(resolver, { retryDelaysMs: [20, 40, 60, 80], reconcileIntervalMs: 0 });
  try {
    await waitFor(async () => (await statusOf(id))?.status === 'PUBLISHED');
    assert.equal(publishCalls, 1);
  } finally {
    await second.close();
  }
});

test('TEMPORARY failure retries and later succeeds', async () => {
  results = [
    { ok: false, errorType: 'TEMPORARY', code: 'TIMEOUT', message: 'timeout' },
    { ok: true, remoteId: 'remote-after-retry' },
  ];
  const runtime = await startPublicationWorker(resolver, { retryDelaysMs: [20, 40, 60, 80], reconcileIntervalMs: 0 });
  try {
    const id = await schedule(0);
    await waitFor(async () => (await statusOf(id))?.status === 'PUBLISHED');
    const row = await statusOf(id);
    assert.equal(publishCalls, 2);
    assert.equal(row?.attemptCount, 2);
    assert.equal(row?.providerRemoteId, 'remote-after-retry');
  } finally {
    await runtime.close();
  }
});

test('TEMPORARY retry exhaustion stops after bounded attempts', async () => {
  results = Array.from({ length: 5 }, () => ({ ok: false, errorType: 'TEMPORARY', code: 'TIMEOUT', message: 'timeout' } as const));
  const runtime = await startPublicationWorker(resolver, { retryDelaysMs: [10, 10, 10, 10], reconcileIntervalMs: 0 });
  try {
    const id = await schedule(0);
    await waitFor(async () => {
      const row = await statusOf(id);
      return row?.status === 'FAILED' && row.attemptCount === 5;
    });
    const row = await statusOf(id);
    assert.equal(publishCalls, 5);
    assert.equal(row?.nextRetryAt, null);
    assert.equal(row?.normalizedErrorType, 'TEMPORARY');
  } finally {
    await runtime.close();
  }
});

test('provider retry_after prevents an early retry while preserving the bounded budget', async () => {
  results=[{ok:false,errorType:'TEMPORARY',code:'TELEGRAM_429',message:'Rate limit',retryAfterMs:450},{ok:true,remoteId:'after-rate-limit'}];
  const runtime=await startPublicationWorker(resolver,{retryDelaysMs:[20,20,20,20],reconcileIntervalMs:0});
  try {
    const id=await schedule(0);
    await waitFor(async()=>publishCalls>=1);
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal(publishCalls,1,'provider delay must take precedence over the default retry delay');
    await waitFor(async()=>(await statusOf(id))?.status==='PUBLISHED');
    assert.equal(publishCalls,2);
  } finally {await runtime.close();}
});
