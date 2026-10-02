import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { posts, postTargets, publications, socialAccounts, users } from '../db/schema.ts';
import { POST as tickPOST } from '../app/api/scheduler/tick/route.ts';
import { createPost } from '../lib/server/posts.ts';
import { runDuePublications } from '../lib/server/scheduler/tick.ts';
import type { PublishResult, SocialConnector } from '../lib/server/connectors/types.ts';

const ownerId = 'scheduler-tick-owner';
const now = new Date('2026-10-02T12:00:00.000Z');
let publishCalls = 0;
let results: PublishResult[] = [];

const connector: SocialConnector = {
  provider: 'TELEGRAM',
  async publish() {
    publishCalls += 1;
    return results.shift() ?? { ok: true, remoteId: `tick-remote-${publishCalls}` };
  },
};

function request(secret?: string) {
  const headers = new Headers();
  if (secret) headers.set('authorization', `Bearer ${secret}`);
  return new Request('http://planly.test/api/scheduler/tick', { method: 'POST', headers });
}

async function schedule(offsetMs: number): Promise<string> {
  const post = await createPost(ownerId, {
    baseText: `tick ${offsetMs}`,
    status: 'READY',
    mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: new Date(now.getTime() + offsetMs).toISOString() }],
  }, { mirrorQueue: async () => undefined });
  const [publication] = await getDb().select().from(publications).where(eq(publications.postId, post.id));
  assert.ok(publication);
  return publication.id;
}

async function publication(id: string) {
  const [row] = await getDb().select().from(publications).where(eq(publications.id, id));
  return row;
}

beforeEach(async () => {
  const db = getDb();
  await db.delete(publications);
  await db.delete(postTargets);
  await db.delete(posts);
  await db.delete(socialAccounts);
  await db.delete(users);
  await db.insert(users).values({ id: ownerId, email: 'scheduler-tick@example.test', displayName: 'Scheduler Tick' });
  await db.insert(socialAccounts).values({
    id: 'scheduler-tick-tg',
    userId: ownerId,
    provider: 'TELEGRAM',
    providerAccountId: '-100123',
    displayName: 'Telegram',
    enabled: true,
    connectionStatus: 'CONNECTED',
  });
  publishCalls = 0;
  results = [];
  delete process.env.SCHEDULER_TICK_SECRET;
});

after(closeDb);

test('web scheduler tick publishes due rows without Redis and leaves future rows alone', async () => {
  const due = await schedule(-1_000);
  const future = await schedule(60_000);

  const result = await runDuePublications({
    now,
    limit: 10,
    resolveConnector: () => connector,
  });

  assert.deepEqual(result, { scanned: 1, processed: 1, published: 1, skipped: 0, failed: 0 });
  assert.equal(publishCalls, 1);
  assert.equal((await publication(due))?.status, 'PUBLISHED');
  assert.equal((await publication(future))?.status, 'SCHEDULED');
});

test('web scheduler tick respects provider retry_after before retrying queued publications', async () => {
  const blocked = await schedule(-60_000);
  const ready = await schedule(-60_000);
  await getDb().update(publications).set({
    status: 'QUEUED',
    nextRetryAt: new Date(now.getTime() + 60_000),
  }).where(eq(publications.id, blocked));
  await getDb().update(publications).set({
    status: 'QUEUED',
    nextRetryAt: new Date(now.getTime() - 1_000),
  }).where(eq(publications.id, ready));

  const result = await runDuePublications({
    now,
    limit: 10,
    resolveConnector: () => connector,
  });

  assert.equal(result.processed, 1);
  assert.equal(publishCalls, 1);
  assert.equal((await publication(blocked))?.status, 'QUEUED');
  assert.equal((await publication(ready))?.status, 'PUBLISHED');
});

test('web scheduler tick preserves temporary failures for a later retry without Redis', async () => {
  results = [
    { ok: false, errorType: 'TEMPORARY', code: 'TIMEOUT', message: 'timeout' },
    { ok: true, remoteId: 'tick-after-retry' },
  ];
  const id = await schedule(-60_000);

  const first = await runDuePublications({
    now,
    limit: 10,
    retryDelaysMs: [30_000],
    resolveConnector: () => connector,
  });

  const queued = await publication(id);
  assert.equal(first.failed, 0);
  assert.equal(first.processed, 1);
  assert.equal(publishCalls, 1);
  assert.equal(queued?.status, 'QUEUED');
  assert.ok(queued?.nextRetryAt && queued.nextRetryAt > now);

  const early = await runDuePublications({
    now: new Date(now.getTime() + 10_000),
    limit: 10,
    retryDelaysMs: [30_000],
    resolveConnector: () => connector,
  });
  assert.equal(early.processed, 0);
  assert.equal(publishCalls, 1);

  const retried = await runDuePublications({
    now: new Date(now.getTime() + 31_000),
    limit: 10,
    retryDelaysMs: [30_000],
    resolveConnector: () => connector,
  });
  assert.equal(retried.published, 1);
  assert.equal(publishCalls, 2);
  assert.equal((await publication(id))?.providerRemoteId, 'tick-after-retry');
});

test('scheduler tick endpoint requires the private bearer secret', async () => {
  process.env.SCHEDULER_TICK_SECRET = 'test-scheduler-secret-000000000000000000';

  const missing = await tickPOST(request());
  assert.equal(missing.status, 401);

  const wrong = await tickPOST(request('wrong-secret'));
  assert.equal(wrong.status, 401);

  const accepted = await tickPOST(request('test-scheduler-secret-000000000000000000'));
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { scanned: 0, processed: 0, published: 0, skipped: 0, failed: 0 });
});
