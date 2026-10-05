import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { libraryItemMedia, libraryItems, mediaAssets, postMedia, posts, users } from '../db/schema.ts';

const ownerA = 'library-owner-a', ownerB = 'library-owner-b';

async function library() {
  const result = await import('../lib/server/library-items.ts').catch(() => null);
  assert.ok(result, 'Library CRUD persistence must be available');
  return result;
}

beforeEach(async () => {
  const db = getDb();
  await db.delete(users);
  await db.insert(users).values([
    { id: ownerA, email: 'library-a@example.test', displayName: 'A' },
    { id: ownerB, email: 'library-b@example.test', displayName: 'B' },
  ]);
  await db.insert(mediaAssets).values([
    { id: 'library-a-1', userId: ownerA, storageKey: 'library/a/1', originalName: '1.png', mimeType: 'image/png', byteSize: 24, checksum: 'a1' },
    { id: 'library-a-2', userId: ownerA, storageKey: 'library/a/2', originalName: '2.png', mimeType: 'image/png', byteSize: 24, checksum: 'a2' },
    { id: 'library-b-1', userId: ownerB, storageKey: 'library/b/1', originalName: '1.png', mimeType: 'image/png', byteSize: 24, checksum: 'b1' },
  ]);
});
after(closeDb);

test('Library create starts READY, trims content and preserves media order without creating a Post', async () => {
  const { createLibraryItem, listLibraryItems } = await library();
  const created = await createLibraryItem(ownerA, { title: '  Idea  ', text: '  Copy  ', mediaIds: ['library-a-2', 'library-a-1'] });
  assert.equal(created.title, 'Idea');
  assert.equal(created.text, 'Copy');
  assert.equal(created.status, 'READY');
  assert.equal(created.sourcePostId, null);
  assert.deepEqual(created.mediaIds, ['library-a-2', 'library-a-1']);
  assert.ok(Number.isFinite(Date.parse(created.createdAt)));
  assert.ok(Number.isFinite(Date.parse(created.updatedAt)));
  assert.deepEqual(await listLibraryItems(ownerA), [created]);
  assert.deepEqual(await listLibraryItems(ownerB), []);
  assert.deepEqual(await getDb().select().from(posts), []);
});

test('Library list orders latest updates first and excludes another owner', async () => {
  const { createLibraryItem, updateLibraryItem, listLibraryItems } = await library();
  const first = await createLibraryItem(ownerA, { text: 'first', mediaIds: [] });
  const second = await createLibraryItem(ownerA, { text: 'second', mediaIds: [] });
  await createLibraryItem(ownerB, { text: 'private', mediaIds: [] });
  await getDb().update(libraryItems).set({ updatedAt: new Date('2000-01-01T00:00:00Z') }).where(eq(libraryItems.id, first.id));
  await getDb().update(libraryItems).set({ updatedAt: new Date('2001-01-01T00:00:00Z') }).where(eq(libraryItems.id, second.id));
  assert.deepEqual((await listLibraryItems(ownerA)).map(item => item.id), [second.id, first.id]);
  await updateLibraryItem(ownerA, first.id, { text: 'edited', mediaIds: [], status: 'READY' });
  assert.deepEqual((await listLibraryItems(ownerA)).map(item => item.id), [first.id, second.id]);
});

test('Library full replacement clears omitted title, replaces ordered media, archives and restores', async () => {
  const { createLibraryItem, updateLibraryItem } = await library();
  const created = await createLibraryItem(ownerA, { title: 'old', text: 'old copy', mediaIds: ['library-a-1', 'library-a-2'] });
  const archived = await updateLibraryItem(ownerA, created.id, { text: '', mediaIds: ['library-a-2'], status: 'ARCHIVED' });
  assert.equal(archived.title, null);
  assert.equal(archived.text, '');
  assert.equal(archived.status, 'ARCHIVED');
  assert.equal(archived.createdAt, created.createdAt);
  assert.deepEqual(archived.mediaIds, ['library-a-2']);
  const restored = await updateLibraryItem(ownerA, created.id, { title: null, text: 'restored', mediaIds: [], status: 'READY' });
  assert.equal(restored.status, 'READY');
  assert.deepEqual(restored.mediaIds, []);
});

test('Library create and update reject foreign or missing media atomically', async () => {
  const { createLibraryItem, updateLibraryItem, listLibraryItems } = await library();
  for (const invalid of ['library-b-1', 'missing-media']) {
    await assert.rejects(() => createLibraryItem(ownerA, { text: 'invalid', mediaIds: ['library-a-1', invalid] }), /not found/i);
    assert.deepEqual(await listLibraryItems(ownerA), []);
    assert.deepEqual(await getDb().select().from(libraryItemMedia), []);
  }
  const created = await createLibraryItem(ownerA, { title: 'original', text: 'original', mediaIds: ['library-a-2', 'library-a-1'] });
  for (const invalid of ['library-b-1', 'missing-media']) {
    await assert.rejects(() => updateLibraryItem(ownerA, created.id, { title: 'invalid', text: 'invalid', mediaIds: ['library-a-1', invalid], status: 'ARCHIVED' }), /not found/i);
    assert.deepEqual(await listLibraryItems(ownerA), [created]);
  }
});

test('Library foreign and missing mutation failures are indistinguishable and preserve the owner item', async () => {
  const { createLibraryItem, updateLibraryItem, deleteLibraryItem, listLibraryItems } = await library();
  const created = await createLibraryItem(ownerA, { text: 'private', mediaIds: [] });
  for (const id of [created.id, 'missing-item']) {
    await assert.rejects(() => updateLibraryItem(ownerB, id, { text: 'attack', mediaIds: [], status: 'ARCHIVED' }), { message: 'Library item not found' });
    await assert.rejects(() => deleteLibraryItem(ownerB, id), { message: 'Library item not found' });
  }
  assert.deepEqual(await listLibraryItems(ownerA), [created]);
});

test('Library edit of USED copy keeps USED and exposes source Post without changing that Post', async () => {
  const { createLibraryItem, updateLibraryItem, listLibraryItems } = await library();
  const created = await createLibraryItem(ownerA, { text: 'original', mediaIds: ['library-a-1'] });
  const db = getDb();
  await db.update(libraryItems).set({ status: 'USED' }).where(eq(libraryItems.id, created.id));
  await db.insert(posts).values({ id: 'library-source-post', userId: ownerA, baseText: 'published copy', status: 'DRAFT', sourceLibraryItemId: created.id });
  await db.insert(postMedia).values({ postId: 'library-source-post', mediaId: 'library-a-1', position: 0 });
  const [postBefore] = await db.select().from(posts);
  for (const status of ['READY', 'ARCHIVED'] as const) {
    const updated = await updateLibraryItem(ownerA, created.id, { text: `edited ${status}`, mediaIds: ['library-a-2'], status });
    assert.equal(updated.status, 'USED');
    assert.equal(updated.text, `edited ${status}`);
    assert.deepEqual(updated.mediaIds, ['library-a-2']);
    assert.equal(updated.sourcePostId, 'library-source-post');
  }
  assert.equal((await listLibraryItems(ownerA))[0].sourcePostId, 'library-source-post');
  assert.deepEqual(await db.select().from(posts), [postBefore]);
  assert.deepEqual((await db.select().from(postMedia)).map(row => row.mediaId), ['library-a-1']);
});

test('Library deletion removes joins, preserves media and source Post, and clears its FK', async () => {
  const { createLibraryItem, deleteLibraryItem, listLibraryItems } = await library();
  const created = await createLibraryItem(ownerA, { text: 'original', mediaIds: ['library-a-1'] });
  const db = getDb();
  await db.update(libraryItems).set({ status: 'USED' }).where(eq(libraryItems.id, created.id));
  await db.insert(posts).values({ id: 'library-source-post', userId: ownerA, baseText: 'post survives', status: 'DRAFT', sourceLibraryItemId: created.id });
  await db.insert(postMedia).values({ postId: 'library-source-post', mediaId: 'library-a-1', position: 0 });
  await deleteLibraryItem(ownerA, created.id);
  assert.deepEqual(await listLibraryItems(ownerA), []);
  assert.deepEqual(await db.select().from(libraryItemMedia), []);
  const [post] = await db.select().from(posts);
  assert.equal(post.id, 'library-source-post');
  assert.equal(post.baseText, 'post survives');
  assert.equal(post.sourceLibraryItemId, null);
  assert.deepEqual((await db.select().from(postMedia)).map(row => row.mediaId), ['library-a-1']);
  assert.equal((await db.select().from(mediaAssets)).length, 3);
});

test('Library DTO never exposes another owner source Post even if linked in the database', async () => {
  const { createLibraryItem, listLibraryItems } = await library();
  const created = await createLibraryItem(ownerA, { text: 'owner copy', mediaIds: [] });
  await getDb().insert(posts).values({ id: 'foreign-source-post', userId: ownerB, baseText: 'private', sourceLibraryItemId: created.id });
  assert.equal((await listLibraryItems(ownerA))[0].sourcePostId, null);
});

test('conditional Library archive preserves ordered media and rejects missing, foreign and USED sources', async () => {
  const { archiveLibraryItem, createLibraryItem, listLibraryItems } = await library();
  const created = await createLibraryItem(ownerA, { title: 'Keep', text: 'Keep copy', mediaIds: ['library-a-2','library-a-1'] });
  for (const id of [created.id, 'missing-item']) {
    await assert.rejects(() => archiveLibraryItem(ownerB, id, created.updatedAt), { name: 'LibrarySourceStaleError' });
  }
  assert.deepEqual(await listLibraryItems(ownerA), [created]);
  const archived = await archiveLibraryItem(ownerA, created.id, created.updatedAt);
  assert.equal(archived.status, 'ARCHIVED'); assert.equal(archived.title, created.title); assert.equal(archived.text, created.text);
  assert.deepEqual(archived.mediaIds, ['library-a-2','library-a-1']);
  await getDb().update(libraryItems).set({ status: 'USED' }).where(eq(libraryItems.id, created.id));
  const [used] = await listLibraryItems(ownerA);
  await assert.rejects(() => archiveLibraryItem(ownerA, used.id, used.updatedAt), { name: 'LibrarySourceConflictError' });
  assert.equal((await listLibraryItems(ownerA))[0].status, 'USED');
  assert.deepEqual(await getDb().select().from(posts), []);
});
