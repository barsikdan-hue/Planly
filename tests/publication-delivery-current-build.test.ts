import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { posts, postTargets, publications, sessions, socialAccounts, users } from '../db/schema.ts';
import { createOwnerSession, SESSION_COOKIE_NAME } from '../lib/server/auth/session.ts';
import { createPost } from '../lib/server/posts.ts';
import { runDuePublications, shouldProcessImmediately } from '../lib/server/scheduler/tick.ts';
import type { SocialConnector } from '../lib/server/connectors/types.ts';
import { POST as postsPOST } from '../app/api/posts/route.ts';
import { GET as bootstrapGET } from '../app/api/bootstrap/route.ts';

const now = new Date('2026-10-05T06:00:00.000Z');
let published: string[] = [];

const connector: SocialConnector = {
  provider: 'TELEGRAM',
  async publish(input) {
    assert.ok(input.destinationId);
    published.push(input.destinationId);
    return { ok: true, remoteId: `remote-${published.length}` };
  },
};

after(closeDb);

beforeEach(async () => {
  const db = getDb();
  await db.delete(publications);
  await db.delete(postTargets);
  await db.delete(posts);
  await db.delete(sessions);
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

async function ownerRequest(path: string, init: RequestInit = {}) {
  const token = await createOwnerSession('owner-a');
  const headers = new Headers(init.headers);
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`);
  return new Request(`http://planly.test${path}`, { ...init, headers });
}

async function withoutTelegramToken<T>(callback: () => Promise<T>): Promise<T> {
  const original = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  try { return await callback(); }
  finally {
    if (original === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = original;
  }
}

test('publish-now input is recognized without treating a future schedule or draft as immediate', () => {
  const immediate = {
    baseText: 'now',
    status: 'READY' as const,
    mediaIds: [],
    targets: [{ provider: 'telegram' as const, textOverride: null, scheduledAt: now.toISOString() }],
  };
  const future = {
    ...immediate,
    targets: [{ ...immediate.targets[0], scheduledAt: new Date(now.getTime() + 60_000).toISOString() }],
  };
  const draft = {
    ...immediate,
    status: 'DRAFT' as const,
    targets: [{ ...immediate.targets[0], scheduledAt: null }],
  };

  assert.equal(shouldProcessImmediately(immediate, new Date(now.getTime() + 2_000)), true);
  assert.equal(shouldProcessImmediately(future, now), false);
  assert.equal(shouldProcessImmediately(draft, now), false);
});

test('scoped catch-up processes only the requested owner and post', async () => {
  const own = await schedule('owner-a', 'own');
  const ownOther = await schedule('owner-a', 'own other');
  const otherOwner = await schedule('owner-b', 'other owner');

  const result = await runDuePublications({
    now,
    userId: 'owner-a',
    postId: own.id,
    limit: 10,
    resolveConnector: () => connector,
  });

  assert.deepEqual(result, { scanned: 1, processed: 1, published: 1, skipped: 0, failed: 0 });
  assert.deepEqual(published, ['-100A']);

  const status = async (postId: string) => {
    const [row] = await getDb().select().from(publications).where(eq(publications.postId, postId));
    return row?.status;
  };
  assert.equal(await status(own.id), 'PUBLISHED');
  assert.equal(await status(ownOther.id), 'SCHEDULED');
  assert.equal(await status(otherOwner.id), 'SCHEDULED');
});

test('publish-now POST processes its publication before returning instead of waiting for cron', async () => {
  await withoutTelegramToken(async () => {
    const scheduledAt = new Date().toISOString();
    const response = await postsPOST(await ownerRequest('/api/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseText: 'route publish now',
        status: 'READY',
        mediaIds: [],
        targets: [{ provider: 'telegram', textOverride: null, scheduledAt }],
      }),
    }));

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.targets[0]?.publication?.status, 'FAILED');
    const [publication] = await getDb().select().from(publications).where(eq(publications.postId, body.id));
    assert.equal(publication?.attemptCount, 1);
    assert.equal(publication?.providerErrorCode, 'PROVIDER_NOT_IMPLEMENTED');
  });
});

test('authenticated bootstrap catches up an overdue owner publication without external cron', async () => {
  await withoutTelegramToken(async () => {
    const post = await createPost('owner-a', {
      baseText: 'bootstrap catch-up',
      status: 'READY',
      mediaIds: [],
      targets: [{ provider: 'telegram', textOverride: null, scheduledAt: new Date(Date.now() - 1_000).toISOString() }],
    }, { mirrorQueue: async () => undefined });

    const response = await bootstrapGET(await ownerRequest('/api/bootstrap'));
    assert.equal(response.status, 200);
    const body = await response.json();
    const refreshed = body.posts.find((candidate: { id: string }) => candidate.id === post.id);
    assert.equal(refreshed?.targets[0]?.publication?.status, 'FAILED');
    const [publication] = await getDb().select().from(publications).where(eq(publications.postId, post.id));
    assert.equal(publication?.attemptCount, 1);
    assert.equal(publication?.providerErrorCode, 'PROVIDER_NOT_IMPLEMENTED');
  });
});