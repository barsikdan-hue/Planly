import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { posts, postTargets, publications, socialAccounts, users } from '../db/schema.ts';
import { runOwnerSchedulerTick } from '../lib/client/planly-api.ts';
import { createPost } from '../lib/server/posts.ts';
import { runDuePublications } from '../lib/server/scheduler/tick.ts';
import type { SocialConnector } from '../lib/server/connectors/types.ts';

const originalFetch = globalThis.fetch;
const now = new Date('2026-10-05T06:00:00.000Z');
let published: string[] = [];

const connector: SocialConnector = {
  provider: 'TELEGRAM',
  async publish(input) {
    published.push(input.destinationId);
    return { ok: true, remoteId: `remote-${published.length}` };
  },
};

afterEach(() => { globalThis.fetch = originalFetch; });
after(closeDb);

beforeEach(async () => {
  const db = getDb();
  await db.delete(publications);
  await db.delete(postTargets);
  await db.delete(posts);
  await db.delete(socialAccounts);
  await db.delete(users);
  published = [];
  await db.insert(users).values([
    { id: 'owner-a', email: 'a@example.test', displayName: 'A' },
    { id: 'owner-b', email: 'b@example.test', displayName: 'B' },
  ]);
  await db.insert(socialAccounts).values([
    { id: 'account-a', userId: 'owner-a', provider: 'TELEGRAM', providerAccountId: '-100A', displayName: 'A', enabled: true, connectionStatus: 'CONNECTED' },
    { id: 'account-b', userId: 'owner-b', provider: 'TELEGRAM', providerAccountId: '-100B', displayName: 'B', enabled: true, connectionStatus: 'CONNECTED' },
  ]);
});

async function schedule(userId: string, text: string) {
  return createPost(userId, {
    baseText: text,
    status: 'READY',
    mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: new Date(now.getTime() - 1_000).toISOString() }],
  }, { mirrorQueue: async () => undefined });
}

test('owner scheduler client uses the authenticated same-origin POST endpoint', async () => {
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    return Response.json({ scanned: 0, processed: 0, published: 0, skipped: 0, failed: 0 });
  };

  await runOwnerSchedulerTick();

  assert.deepEqual(calls, [{ url: '/api/scheduler/owner-tick', method: 'POST' }]);
});

test('owner scheduler tick processes only publications belonging to that owner', async () => {
  const own = await schedule('owner-a', 'own');
  const other = await schedule('owner-b', 'other');

  const result = await runDuePublications({
    now,
    userId: 'owner-a',
    limit: 10,
    resolveConnector: () => connector,
  });

  assert.deepEqual(result, { scanned: 1, processed: 1, published: 1, skipped: 0, failed: 0 });
  assert.deepEqual(published, ['-100A']);

  const [ownPublication] = await getDb().select().from(publications).where(eq(publications.postId, own.id));
  const [otherPublication] = await getDb().select().from(publications).where(eq(publications.postId, other.id));
  assert.equal(ownPublication?.status, 'PUBLISHED');
  assert.equal(otherPublication?.status, 'SCHEDULED');
});
