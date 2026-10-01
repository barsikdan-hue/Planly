import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, socialAccounts, users } from '../db/schema.ts';
import { createPost, deletePost, listPlannerPosts, updatePost } from '../lib/server/posts.ts';

const ownerA = 'test-owner-a';
const ownerB = 'test-owner-b';

async function reset() {
  const db = getDb();
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
after(closeDb);

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

test('updating a post does not create duplicate targets', async () => {
  const created = await createPost(ownerA, {
    baseText: 'one', status: 'READY', mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: null }],
  });
  await updatePost(ownerA, created.id, {
    baseText: 'two', status: 'READY', mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: 'override', scheduledAt: null }],
  });
  const db = getDb();
  const rows = await db.select().from(postTargets).where(eq(postTargets.postId, created.id));
  assert.equal(rows.length, 1);
});
