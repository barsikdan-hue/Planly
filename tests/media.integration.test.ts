import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { libraryItems, libraryItemMedia, mediaAssets, postMedia, posts, postTargets, publications, sessions, socialAccounts, users } from '../db/schema.ts';
import { createMediaAsset, deleteMediaAsset, listMediaAssetsWithPreview } from '../lib/server/media.ts';
import type { ObjectStorage } from '../lib/server/storage.ts';

const ownerA='media-owner-a', ownerB='media-owner-b';
function png() { return new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]); }

function fakeStorage() {
  const puts:string[]=[]; const deletes:string[]=[];
  const storage: ObjectStorage = {
    async put(key) { puts.push(key); },
    async delete(key) { deletes.push(key); },
    async signedGetUrl(key) { return `https://preview.test/${encodeURIComponent(key)}?sig=test`; },
  };
  return { storage, puts, deletes };
}

beforeEach(async()=>{
  const db=getDb();
  await db.delete(publications);await db.delete(postMedia);await db.delete(postTargets);await db.delete(posts);await db.delete(mediaAssets);await db.delete(sessions);await db.delete(socialAccounts);await db.delete(users);
  await db.insert(users).values([{id:ownerA,email:'media-a@example.test',displayName:'A'},{id:ownerB,email:'media-b@example.test',displayName:'B'}]);
});

test('Library-only media reference prevents asset and object deletion until detached', async () => {
  const fake = fakeStorage();
  const created = await createMediaAsset(ownerA, new File([png()], 'library.png', { type: 'image/png' }), fake.storage);
  await getDb().insert(libraryItems).values({ id: 'library-media-item', userId: ownerA, bodyText: '' });
  await getDb().insert(libraryItemMedia).values({ libraryItemId: 'library-media-item', mediaId: created.id, position: 0 });
  await assert.rejects(() => deleteMediaAsset(ownerA, created.id, fake.storage), /attached/i);
  assert.equal((await listMediaAssetsWithPreview(ownerA, fake.storage)).length, 1);
  assert.equal((await getDb().select().from(libraryItemMedia)).length, 1);
  assert.deepEqual(fake.deletes, []);
  await getDb().delete(libraryItems);
  await deleteMediaAsset(ownerA, created.id, fake.storage);
  assert.deepEqual(await listMediaAssetsWithPreview(ownerA, fake.storage), []);
  assert.deepEqual(fake.deletes, fake.puts);
});

test('media deletion waits for a concurrent Library attachment and preserves the committed attachment', async () => {
  const fake = fakeStorage();
  const created = await createMediaAsset(ownerA, new File([png()], 'race.png', { type: 'image/png' }), fake.storage);
  const db = getDb();
  await db.insert(libraryItems).values({ id: 'racing-library', userId: ownerA, bodyText: 'copy' });
  let release!: () => void;
  let attached!: () => void;
  const ready = new Promise<void>(resolve => { attached = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  const attach = db.transaction(async tx => {
    await tx.insert(libraryItemMedia).values({ libraryItemId: 'racing-library', mediaId: created.id, position: 0 });
    attached();
    await hold;
  });
  await ready;
  const deletion = deleteMediaAsset(ownerA, created.id, fake.storage).then(
    () => ({ error: null }), error => ({ error }),
  );
  let blocked = false;
  let result: Awaited<typeof deletion>;
  try {
    // Observe a real PostgreSQL lock wait instead of guessing when DELETE has read its references.
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await db.execute(sql`select 1 from pg_stat_activity
        where datname = current_database() and pid <> pg_backend_pid()
          and wait_event_type = 'Lock' and query like '%media_assets%' limit 1`);
      if (result.rows.length) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  } finally {
    release();
    await attach;
    result = await deletion;
  }
  assert.ok(blocked, 'Media deletion must reach the held PostgreSQL asset lock');
  assert.ok(result.error instanceof Error);
  assert.match(result.error.message, /attached/i);
  assert.equal((await listMediaAssetsWithPreview(ownerA, fake.storage)).length, 1);
  assert.equal((await db.select().from(libraryItemMedia)).length, 1);
  assert.deepEqual(fake.deletes, []);
});
after(closeDb);

test('upload validates before storage, persists owner metadata and returns signed preview', async()=>{
  const fake=fakeStorage();
  const created=await createMediaAsset(ownerA,new File([png()],'../../evil name.png',{type:'image/png'}),fake.storage);
  assert.equal(fake.puts.length,1);
  assert.doesNotMatch(fake.puts[0],/evil|\.\./);
  assert.equal(created.mimeType,'image/png');
  const list=await listMediaAssetsWithPreview(ownerA,fake.storage);
  assert.equal(list.length,1);
  assert.match(list[0].previewUrl,/^https:\/\/preview\.test\//);
});

test('cross-owner delete is rejected and attached media cannot be deleted', async()=>{
  const fake=fakeStorage();
  const created=await createMediaAsset(ownerA,new File([png()],'a.png',{type:'image/png'}),fake.storage);
  await assert.rejects(()=>deleteMediaAsset(ownerB,created.id,fake.storage),/not found/i);
  await getDb().insert(posts).values({id:'p1',userId:ownerA,baseText:'post',status:'DRAFT'});
  await getDb().insert(postMedia).values({postId:'p1',mediaId:created.id,position:0});
  await assert.rejects(()=>deleteMediaAsset(ownerA,created.id,fake.storage),/attached/i);
  assert.equal(fake.deletes.length,0);
});

test('failed database insert compensates by deleting uploaded object', async()=>{
  const fake=fakeStorage();
  await assert.rejects(()=>createMediaAsset('missing-owner',new File([png()],'a.png',{type:'image/png'}),fake.storage));
  assert.equal(fake.puts.length,1);
  assert.deepEqual(fake.deletes,fake.puts);
});
