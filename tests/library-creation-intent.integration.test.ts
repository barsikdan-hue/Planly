// Native PostgreSQL: catches duplicate intent, mutable replay, resurrection and incomplete rollback.
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { libraryItems, mediaAssets, posts, users } from '../db/schema.ts';
import * as library from '../lib/server/library-items.ts';
import type { CreateLibraryItemInput, LibraryItemDto } from '../lib/contracts/library.ts';

const owner = 'intent-owner', other = 'intent-other';
const input = { title: 'Original', text: 'Original copy', mediaIds: ['intent-b', 'intent-a'] };
// Before Task1, run the real unprotected primitive with the same intent: semantic RED,
// not an import/fixture error. Once implemented, the exact planned interface is used.
const service = library as typeof library & { createLibraryItemForIntent?: (owner:string,input:CreateLibraryItemInput,key:string)=>Promise<LibraryItemDto> };
const create = (who:string, body:CreateLibraryItemInput, key:string) => service.createLibraryItemForIntent
  ? service.createLibraryItemForIntent(who, body, key) : library.createLibraryItem(who, body);
const count = async () => (await getDb().select().from(libraryItems).where(eq(libraryItems.userId, owner))).length;
const attempts = async () => (await getDb().execute(sql`select * from library_creation_attempts where user_id=${owner}`)).rows;
beforeEach(async () => {
  const db=getDb(); await db.delete(users);
  await db.insert(users).values([{id:owner,email:'intent@example.test',displayName:'A'}, {id:other,email:'intent-other@example.test',displayName:'B'}]);
  await db.insert(mediaAssets).values(['intent-a','intent-b'].map(id=>({id,userId:owner,storageKey:id,originalName:id,mimeType:'image/png',byteSize:1,checksum:id})));
});
after(closeDb);

test('one durable owner/key intent returns one mapping and one item', async () => {
  const key=randomUUID(), first=await create(owner,input,key), second=await create(owner,input,key);
  assert.equal(await count(),1,'same intent must not insert twice'); assert.equal(second.id,first.id);
  assert.equal((await attempts()).length,1);
});
test('native owner lock barrier converges three same-key requests, distinct keys remain independent', async () => {
  const key=randomUUID(); let release!:()=>void, locked!:()=>void;
  const entered=new Promise<void>(resolve=>{locked=resolve;}); const gate=new Promise<void>(resolve=>{release=resolve;});
  const barrier=getDb().transaction(async tx=>{await tx.select().from(users).where(eq(users.id,owner)).for('update');locked();await gate;});
  await entered;
  const pending=[create(owner,input,key),create(owner,input,key),create(owner,input,key)];
  release(); await barrier; const results=await Promise.all(pending);
  assert.equal(await count(),1); assert.equal(new Set(results.map(value=>value.id)).size,1);
  await create(owner,input,randomUUID()); assert.equal(await count(),2);
});
test('original title/text/ordered media hash rejects changed payload and retains original mapping', async () => {
  const key=randomUUID(), first=await create(owner,input,key);
  for(const changed of [{...input,title:'Changed'},{...input,text:'Changed'},{...input,mediaIds:[...input.mediaIds].reverse()}]) {
    await assert.rejects(()=>create(owner,changed,key), {name:'LibraryCreationConflictError'});
  }
  assert.equal((await create(owner,input,key)).id,first.id); assert.equal(await count(),1);
});
test('equal key is owner scoped and invalid owned media rolls back admission', async () => {
  const key=randomUUID(), body={text:'Same',mediaIds:[]};
  assert.notEqual((await create(owner,body,key)).id,(await create(other,body,key)).id);
  await assert.rejects(()=>create(other,input,randomUUID()),/not found/i);
  const retry=randomUUID(); await assert.rejects(()=>create(owner,{...input,mediaIds:['missing']},retry),/not found/i);
  assert.equal((await attempts()).length,1); await create(owner,input,retry); assert.equal(await count(),2);
});
test('malformed key and invalid content persist neither mapping nor item', async () => {
  await assert.rejects(()=>create(owner,input,'not-a-uuid'));
  await assert.rejects(()=>create(owner,{text:' ',mediaIds:[]},randomUUID()));
  assert.equal(await count(),0); assert.equal((await attempts()).length,0);
});
test('replay returns current ARCHIVED/USED content/media/provenance without old-media validation', async () => {
  const key=randomUUID(), first=await create(owner,input,key);
  const changed=await library.updateLibraryItem(owner,first.id,{title:'Current',text:'Current',mediaIds:['intent-a'],status:'ARCHIVED'});
  assert.deepEqual(await create(owner,input,key),changed);
  await getDb().delete(mediaAssets).where(eq(mediaAssets.id,'intent-b'));
  await getDb().update(libraryItems).set({status:'USED'}).where(eq(libraryItems.id,first.id));
  await getDb().insert(posts).values({id:'intent-source',userId:owner,baseText:'Independent',status:'DRAFT',sourceLibraryItemId:first.id});
  const current=(await library.listLibraryItems(owner))[0];
  assert.deepEqual(await create(owner,input,key),current); assert.equal(current.sourcePostId,'intent-source'); assert.equal(await count(),1);
});
test('delete retains terminal result after pool restart, changed deleted body conflicts first', async () => {
  const key=randomUUID(), first=await create(owner,input,key); await library.deleteLibraryItem(owner,first.id); await closeDb();
  await assert.rejects(()=>create(owner,input,key),{name:'LibraryCreationDeletedError'});
  await assert.rejects(()=>create(owner,{...input,text:'Changed'},key),{name:'LibraryCreationConflictError'});
  assert.equal(await count(),0); assert.equal((await attempts())[0].state,'DELETED');
});
test('foreign/missing and legacy deletes preserve owned intent history', async () => {
  const key=randomUUID(), first=await create(owner,input,key);
  await assert.rejects(()=>library.deleteLibraryItem(other,first.id),/not found/i);
  await assert.rejects(()=>library.deleteLibraryItem(owner,'missing'),/not found/i);
  const legacy=await library.createLibraryItem(owner,{text:'Legacy',mediaIds:[]}); await library.deleteLibraryItem(owner,legacy.id);
  assert.equal((await create(owner,input,key)).id,first.id); assert.equal((await attempts())[0].state,'CREATED');
});
test('test-only transaction constraint rolls back item/media/mapping together', async () => {
  const db=getDb();
  await db.execute(sql`alter table library_creation_attempts add constraint intent_test_reject check (input_hash='never')`);
  try { await assert.rejects(()=>create(owner,input,randomUUID())); assert.equal(await count(),0); assert.equal((await attempts()).length,0); }
  finally { await db.execute(sql`alter table library_creation_attempts drop constraint intent_test_reject`); }
});
