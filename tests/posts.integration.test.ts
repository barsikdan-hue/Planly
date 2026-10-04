import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { libraryItems, mediaAssets, postMedia, posts, postTargets, publications, socialAccounts, users } from '../db/schema.ts';
import { createPost, deletePost, listPlannerPosts, updatePost } from '../lib/server/posts.ts';
import { closePublicationQueue } from '../lib/server/scheduler/queue.ts';
import { closeRedisConnection } from '../lib/server/scheduler/redis.ts';
import { createOwnerSession, SESSION_COOKIE_NAME } from '../lib/server/auth/session.ts';
import { PATCH } from '../app/api/posts/[id]/route.ts';

const ownerA = 'test-owner-a';
const ownerB = 'test-owner-b';

async function reset() {
  const db = getDb();
  await db.delete(publications);
  await db.delete(postMedia);
  await db.delete(postTargets);
  await db.delete(posts);
  await db.delete(mediaAssets);
  await db.delete(socialAccounts);
  await db.delete(users);
  await db.insert(users).values([
    { id: ownerA, email: 'owner-a@example.test', displayName: 'Owner A' },
    { id: ownerB, email: 'owner-b@example.test', displayName: 'Owner B' },
  ]);
  await db.insert(socialAccounts).values([
    { id: 'tg-a', userId: ownerA, provider: 'TELEGRAM', displayName: 'Telegram' },
    { id: 'max-a', userId: ownerA, provider: 'MAX', displayName: 'MAX' },
    { id: 'tg-b', userId: ownerB, provider: 'TELEGRAM', displayName: 'Telegram' },
    { id: 'max-b', userId: ownerB, provider: 'MAX', displayName: 'MAX' },
  ]);
  await db.insert(mediaAssets).values([
    { id: 'm-a-1', userId: ownerA, storageKey: 'a/1.jpg', originalName: '1.jpg', mimeType: 'image/jpeg', byteSize: 10, checksum: 'a1' },
    { id: 'm-a-2', userId: ownerA, storageKey: 'a/2.jpg', originalName: '2.jpg', mimeType: 'image/jpeg', byteSize: 11, checksum: 'a2' },
    { id: 'm-b-1', userId: ownerB, storageKey: 'b/1.jpg', originalName: '1.jpg', mimeType: 'image/jpeg', byteSize: 12, checksum: 'b1' },
  ]);
}

before(async () => { await reset(); });
beforeEach(reset);
after(async () => {
  await closePublicationQueue();
  await closeRedisConnection();
  await closeDb();
});

test('create/update preserves per-provider text, schedule and media order', async () => {
  const created = await createPost(ownerA, {
    baseText: 'base',
    status: 'READY',
    targets: [
      { provider: 'telegram', textOverride: 'tg text', scheduledAt: '2030-01-01T09:00:00.000Z' },
      { provider: 'max', textOverride: 'max text', scheduledAt: null },
    ],
    mediaIds: ['m-a-2', 'm-a-1'],
  });
  assert.equal(created.baseText, 'base');
  assert.deepEqual(created.targets.map(t => t.provider), ['telegram', 'max']);
  assert.deepEqual(created.mediaIds, ['m-a-2', 'm-a-1']);

  const updated = await updatePost(ownerA, created.id, {
    baseText: 'changed',
    status: 'DRAFT',
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: null }],
    mediaIds: ['m-a-1'],
  });
  assert.equal(updated.baseText, 'changed');
  assert.deepEqual(updated.targets.map(t => t.provider), ['telegram']);
  assert.deepEqual(updated.mediaIds, ['m-a-1']);
});

test('second owner cannot read, update or delete another owners post', async () => {
  const created = await createPost(ownerA, { baseText: 'private', status: 'DRAFT', targets: [], mediaIds: [] });
  assert.equal((await listPlannerPosts(ownerB)).length, 0);
  await assert.rejects(() => updatePost(ownerB, created.id, { baseText: 'steal', status: 'DRAFT', targets: [], mediaIds: [] }), /not found/i);
  await assert.rejects(() => deletePost(ownerB, created.id), /not found/i);
  assert.equal((await listPlannerPosts(ownerA)).length, 1);
});

test('foreign-owner media is rejected and transaction leaves no post behind', async () => {
  await assert.rejects(() => createPost(ownerA, { baseText: 'bad', status: 'DRAFT', targets: [], mediaIds: ['m-b-1'] }), /media/i);
  assert.equal((await listPlannerPosts(ownerA)).length, 0);
});

test('updating a post preserves target identity for the same social account', async () => {
  const created = await createPost(ownerA, {
    baseText: 'one', status: 'READY', mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: null }],
  });
  const originalTargetId = created.targets[0]!.id;
  const updated = await updatePost(ownerA, created.id, {
    baseText: 'two', status: 'READY', mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: 'override', scheduledAt: null }],
  });
  assert.equal(updated.targets[0]!.id, originalTargetId);
  const db = getDb();
  const rows = await db.select().from(postTargets).where(eq(postTargets.postId, created.id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.id, originalTargetId);
});

test('ordinary Post creation without a source preserves null provenance and leaves Library READY', async () => {
  await getDb().insert(libraryItems).values({ id: 'posts-independent-source', userId: ownerA, bodyText: 'Independent library copy' });
  const created = await createPost(ownerA, { baseText: 'ordinary post', status: 'DRAFT', targets: [], mediaIds: [] }, { mirrorQueue: async () => undefined });
  const [stored] = await getDb().select().from(posts).where(eq(posts.id, created.id));
  assert.equal(stored.sourceLibraryItemId, null);
  assert.equal((await getDb().select().from(libraryItems))[0].status, 'READY');
});

test('Post PATCH cannot replace or clear source provenance and does not consume another Library item', async () => {
  await getDb().insert(libraryItems).values([
    { id: 'posts-original-source', userId: ownerA, bodyText: 'original', status: 'USED' },
    { id: 'posts-other-source', userId: ownerA, bodyText: 'other' },
  ]);
  const created = await createPost(ownerA, { baseText: 'original post', status: 'DRAFT', targets: [], mediaIds: [] }, { mirrorQueue: async () => undefined });
  await getDb().update(posts).set({ sourceLibraryItemId: 'posts-original-source' }).where(eq(posts.id, created.id));
  await getDb().update(users).set({ email: process.env.OWNER_EMAIL ?? 'owner@example.test' }).where(eq(users.id, ownerA));
  const token = await createOwnerSession(ownerA);
  for (const sourceLibraryItemId of ['posts-other-source', null]) {
    const response = await PATCH(new Request(`http://planly.test/api/posts/${created.id}`, { method: 'PATCH', headers: {
      cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`, 'content-type': 'application/json',
    }, body: JSON.stringify({ baseText: 'edited post', status: 'DRAFT', targets: [], mediaIds: [], sourceLibraryItemId }) }),
    { params: Promise.resolve({ id: created.id }) });
    assert.equal(response.status, 200);
    const [stored] = await getDb().select().from(posts).where(eq(posts.id, created.id));
    assert.equal(stored.sourceLibraryItemId, 'posts-original-source');
  }
  assert.equal((await getDb().select().from(libraryItems)).find(item => item.id === 'posts-other-source')?.status, 'READY');
});

test('updatePost ignores source options and preserves the immutable original source', async () => {
  await getDb().insert(libraryItems).values([
    { id: 'posts-original-source', userId: ownerA, bodyText: 'original', status: 'USED' },
    { id: 'posts-other-source', userId: ownerA, bodyText: 'other' },
  ]);
  const created = await createPost(ownerA, { baseText: 'original post', status: 'DRAFT', targets: [], mediaIds: [] }, { mirrorQueue: async () => undefined });
  await getDb().update(posts).set({ sourceLibraryItemId: 'posts-original-source' }).where(eq(posts.id, created.id));
  await updatePost(ownerA, created.id, { baseText: 'edited post', status: 'DRAFT', targets: [], mediaIds: [] },
    { sourceLibraryItemId: 'posts-other-source', mirrorQueue: async () => undefined });
  assert.equal((await getDb().select().from(posts).where(eq(posts.id, created.id)))[0].sourceLibraryItemId, 'posts-original-source');
  assert.equal((await getDb().select().from(libraryItems)).find(item => item.id === 'posts-other-source')?.status, 'READY');
});
