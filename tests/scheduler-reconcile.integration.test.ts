import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { posts, postTargets, publications, socialAccounts, users } from '../db/schema.ts';
import { createPost, updatePost } from '../lib/server/posts.ts';
import { applyPublicationQueueChanges, reconcileScheduledJobs } from '../lib/server/scheduler/reconcile.ts';

const ownerId = 'scheduler-reconcile-owner';

type FakeQueue = Map<string, number>;

function fakeQueueOperations(jobs: FakeQueue) {
  return {
    ensurePublicationJob: async (publicationId: string, runAt: Date) => {
      const desired = runAt.getTime();
      if (jobs.get(publicationId) === desired) return false;
      jobs.set(publicationId, desired);
      return true;
    },
    removePublicationJob: async (publicationId: string) => jobs.delete(publicationId),
  };
}

async function reset() {
  const db = getDb();
  await db.delete(publications);
  await db.delete(postTargets);
  await db.delete(posts);
  await db.delete(socialAccounts);
  await db.delete(users);
  await db.insert(users).values({ id: ownerId, email: 'scheduler-reconcile@example.test', displayName: 'Scheduler' });
  await db.insert(socialAccounts).values({ id: 'scheduler-tg', userId: ownerId, provider: 'TELEGRAM', displayName: 'Telegram' });
}

before(reset);
beforeEach(reset);
after(closeDb);

test('PostgreSQL commit survives queue mirroring failure', async () => {
  const created = await createPost(ownerId, {
    baseText: 'survives redis outage', status: 'READY', mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: '2030-01-01T09:00:00.000Z' }],
  }, {
    mirrorQueue: async () => { throw new Error('redis unavailable'); },
  });

  const db = getDb();
  const rows = await db.select().from(publications).where(eq(publications.postId, created.id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.status, 'SCHEDULED');
});

test('reconciliation restores a missing job exactly once from PostgreSQL', async () => {
  await createPost(ownerId, {
    baseText: 'restore me', status: 'READY', mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: '2030-01-01T09:00:00.000Z' }],
  }, { mirrorQueue: async () => undefined });

  const jobs: FakeQueue = new Map();
  const ops = fakeQueueOperations(jobs);
  const first = await reconcileScheduledJobs(new Date('2029-12-31T00:00:00.000Z'), ops);
  assert.deepEqual(first, { scanned: 1, enqueued: 1 });
  assert.equal(jobs.size, 1);

  const second = await reconcileScheduledJobs(new Date('2029-12-31T00:00:00.000Z'), ops);
  assert.deepEqual(second, { scanned: 1, enqueued: 0 });
  assert.equal(jobs.size, 1);
});

test('reschedule replaces the old delayed time for the same publication job', async () => {
  const jobs: FakeQueue = new Map();
  const ops = fakeQueueOperations(jobs);
  const mirrorQueue = (changes: Parameters<typeof applyPublicationQueueChanges>[0]) => applyPublicationQueueChanges(changes, ops);

  const created = await createPost(ownerId, {
    baseText: 'move me', status: 'READY', mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: '2030-01-01T09:00:00.000Z' }],
  }, { mirrorQueue });
  const db = getDb();
  const [publication] = await db.select().from(publications).where(eq(publications.postId, created.id));
  assert.ok(publication);
  assert.equal(jobs.get(publication.id), Date.parse('2030-01-01T09:00:00.000Z'));

  await updatePost(ownerId, created.id, {
    baseText: 'move me', status: 'READY', mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: '2030-01-01T10:30:00.000Z' }],
  }, { mirrorQueue });
  assert.equal(jobs.size, 1);
  assert.equal(jobs.get(publication.id), Date.parse('2030-01-01T10:30:00.000Z'));
});

test('cancelled publications are removed and never re-enqueued by reconciliation', async () => {
  const jobs: FakeQueue = new Map();
  const ops = fakeQueueOperations(jobs);
  const mirrorQueue = (changes: Parameters<typeof applyPublicationQueueChanges>[0]) => applyPublicationQueueChanges(changes, ops);

  const created = await createPost(ownerId, {
    baseText: 'cancel me', status: 'READY', mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: '2030-01-01T09:00:00.000Z' }],
  }, { mirrorQueue });
  assert.equal(jobs.size, 1);

  await updatePost(ownerId, created.id, {
    baseText: 'cancel me', status: 'DRAFT', mediaIds: [], targets: [],
  }, { mirrorQueue });
  assert.equal(jobs.size, 0);

  const result = await reconcileScheduledJobs(new Date('2029-12-31T00:00:00.000Z'), ops);
  assert.deepEqual(result, { scanned: 0, enqueued: 0 });
  assert.equal(jobs.size, 0);
});

test('Redis queue reconstruction respects future provider retry deadline', async()=>{
  const created=await createPost(ownerId,{baseText:'rate limited',status:'READY',mediaIds:[],targets:[{provider:'telegram',textOverride:null,scheduledAt:new Date(Date.now()-10_000).toISOString()}]}, {mirrorQueue:async()=>{}});
  const [publication]=await getDb().select().from(publications).where(eq(publications.postId,created.id));
  const retryAt=new Date(Date.now()+60_000);
  await getDb().update(publications).set({status:'QUEUED',nextRetryAt:retryAt,attemptCount:1,providerErrorCode:'TELEGRAM_429'}).where(eq(publications.id,publication.id));
  const jobs: FakeQueue = new Map(); // Models an empty Redis queue after loss.
  await reconcileScheduledJobs(new Date(),fakeQueueOperations(jobs));
  assert.equal(jobs.get(publication.id),retryAt.getTime(),'recovered job must not bypass retry_after');
});
