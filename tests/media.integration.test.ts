import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb, getDb } from '../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, publications, sessions, socialAccounts, users } from '../db/schema.ts';
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
