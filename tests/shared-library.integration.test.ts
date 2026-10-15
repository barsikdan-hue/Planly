import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { eq, sql } from 'drizzle-orm';
import { Client } from 'pg';
import { getDb, getPool, closeDb } from '../db/index.ts';
import { users, sessions, libraryItems, libraryItemMedia, mediaAssets, posts, publications, postTargets } from '../db/schema.ts';
import { createOwnerSession } from '../lib/server/auth/session.ts';
import { hashOwnerPassword } from '../lib/server/auth/password.ts';
import { resetServerEnvForTests } from '../lib/server/env.ts';
import { updateLibraryItem, deleteLibraryItem, listLibraryItems } from '../lib/server/library-items.ts';
import { createMediaAsset, listMediaAssetsWithPreview } from '../lib/server/media.ts';
import { getObjectStorage } from '../lib/server/storage.ts';

// All data and HTTP objects belong to this disposable local test fixture.
const database = new URL(process.env.DATABASE_URL!);
assert.ok(['127.0.0.1','localhost'].includes(database.hostname) && database.pathname === '/planly_test');
const db = getDb(), owners = ['shared-admin','shared-a','shared-b'];
const objectBytes = new Map<string, Buffer>();
let failPut = 0, failDelete = false, puts: string[] = [], deletes: string[] = [];
let getEntered: (()=>void) | undefined, finishGet: Promise<void> | undefined;
let stallMutation:'PUT'|'DELETE'|undefined,mutationEntered:(()=>void)|undefined,mutationClosed:(()=>void)|undefined;
const stalledResponses=new Set<ServerResponse>();
function stallResponse(method:'PUT'|'DELETE',res:ServerResponse) {
  if(stallMutation!==method)return false;
  stalledResponses.add(res);res.on('close',()=>{stalledResponses.delete(res);mutationClosed?.();});mutationEntered?.();return true;
}
const server = createServer(async (req, res) => {
  const key = decodeURIComponent(new URL(req.url!, 'http://fixture').pathname.slice('/fixtures/'.length));
  if (req.method === 'PUT') {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    objectBytes.set(key, Buffer.concat(chunks)); puts.push(key);
    if(stallResponse('PUT',res))return;
    if (failPut && puts.length === failPut) { req.socket.destroy(); return; }
    res.end(); return;
  }
  if (req.method === 'DELETE') { deletes.push(key); if(stallResponse('DELETE',res))return; if(failDelete) {res.writeHead(503);res.end();return;} objectBytes.delete(key);res.end();return; }
  getEntered?.(); if(finishGet) await finishGet;
  const bytes = objectBytes.get(key); if(!bytes) {res.writeHead(404);res.end();return;} res.end(bytes);
});
type Route = (request: Request, context?: {params:Promise<{id:string}>})=>Promise<Response>;
let sharedGet: Route, adminGet: Route, sharePost: Route, copyPost: Route;
let tokens: string[];
function req(path: string, token = '', method = 'GET', body?: unknown, extra: Record<string,string> = {}) {
  return new Request(`http://planly.test${path}`, {method,headers:{cookie:`planly_session=${token}`,'content-type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
function context(id: string) {return {params:Promise.resolve({id})};}
async function share(source = 'source-one', shared = true) { return sharePost(req(`/api/admin/shared-library/${source}`, tokens[0], 'POST', {shared}),context(source)); }
async function catalog(token = tokens[1]) {const response=await sharedGet(req('/api/shared-library',token));assert.equal(response.status,200);return (await response.json()).items;}
async function copy(ids: string[], token = tokens[1], key = randomUUID()) {return copyPost(req('/api/shared-library/copy',token,'POST',{ids},{'idempotency-key':key}));}
async function published() {assert.equal((await share()).status,200);return (await catalog())[0].id as string;}
async function fixtureMedia(source='source-one', owner=owners[0], count=2) {
  for(let position=0;position<count;position++) {
    const id=`${source}-asset-${position}`,bytes=Buffer.from(`private-bytes-${source}-${position}`), key=`private/${id}`;
    objectBytes.set(key,bytes);
    await db.insert(mediaAssets).values({id,userId:owner,storageKey:key,originalName:`asset-${position}.${position?'mp4':'png'}`,mimeType:position?'video/mp4':'image/png',byteSize:bytes.length,checksum:createHash('sha256').update(bytes).digest('hex'),width:4,height:5,durationMs:position?1000:null});
    await db.insert(libraryItemMedia).values({libraryItemId:source,mediaId:id,position});
  }
}
before(async()=>{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address && typeof address!=='string');
  Object.assign(process.env,{OWNER_EMAIL:'owner@example.test',OWNER_PASSWORD_HASH:await hashOwnerPassword('fixture-password'),SESSION_SECRET:'shared-library-fixture-session-secret',S3_ENDPOINT:`http://127.0.0.1:${address.port}`,S3_REGION:'fixture',S3_BUCKET:'fixtures',S3_ACCESS_KEY_ID:'fixture-access',S3_SECRET_ACCESS_KEY:'fixture-secret'});
  delete process.env.S3_PUBLIC_ENDPOINT;resetServerEnvForTests();
  // Assert missing feature as a behavior failure, then exercise real routes.
  const load = async(path:string) => import(path);
  sharedGet=(await load('../app/api/shared-library/route.ts')).GET;
  adminGet=(await load('../app/api/admin/shared-library/route.ts')).GET;
  sharePost=(await load('../app/api/admin/shared-library/[id]/route.ts')).POST;
  copyPost=(await load('../app/api/shared-library/copy/route.ts')).POST;
});
beforeEach(async()=>{
  assert.equal(typeof sharedGet,'function','shared catalog route must exist');
  await db.delete(posts);await db.delete(users);
  await db.insert(users).values(owners.map((id,i)=>({id,email:i?`${id}@example.test`:'owner@example.test',displayName:id,role:i?'USER' as const:'ADMIN' as const,accessState:'ACTIVE' as const,authInitialized:true})));
  tokens=await Promise.all(owners.map(id=>createOwnerSession(id)));
  await db.insert(libraryItems).values([{id:'source-one',userId:owners[0],title:'Shared title',bodyText:'Shared body'},{id:'source-two',userId:owners[0],bodyText:'Second body'},{id:'a-private',userId:owners[1],bodyText:'Private A'},{id:'b-private',userId:owners[2],bodyText:'Private B'}]);
  objectBytes.clear();puts=[];deletes=[];failPut=0;failDelete=false;getEntered=undefined;finishGet=undefined;
  stallMutation=undefined;mutationEntered=undefined;mutationClosed=undefined;
});
after(async()=>{await db.delete(posts);await db.delete(users);await closeDb();await new Promise<void>(resolve=>server.close(()=>resolve()));resetServerEnvForTests();});

test('explicit ADMIN publication uses opaque share identity and exposes only selected ordered previews',async()=>{
  await fixtureMedia();assert.deepEqual(await catalog(),[]);
  const id=await published();assert.notEqual(id,'source-one');
  const [item]=await catalog(tokens[2]);assert.deepEqual(Object.keys(item).sort(),['id','media','text','title','updatedAt']);
  assert.equal(item.title,'Shared title');assert.equal(item.text,'Shared body');
  assert.deepEqual(item.media.map((m:{name:string;mimeType:string})=>[m.name,m.mimeType]),[['asset-0.png','image/png'],['asset-1.mp4','video/mp4']]);
  for(const media of item.media)assert.deepEqual(Object.keys(media).sort(),['mimeType','name','previewUrl']);
  const admin=await adminGet(req('/api/admin/shared-library',tokens[0]));assert.deepEqual(await admin.json(),{sourceIds:['source-one']});
  assert.deepEqual((await listLibraryItems(owners[1])).map(x=>x.id),['a-private']);assert.deepEqual(await listMediaAssetsWithPreview(owners[1]),[]);
});
test('real sessions, ADMIN ownership, strict payloads and CSRF deny unauthorized publication/copy',async()=>{
  for(const token of ['',`forged-${tokens[1]}`])assert.equal((await sharedGet(req('/api/shared-library',token))).status,401);
  assert.equal((await adminGet(req('/api/admin/shared-library',tokens[1]))).status,403);
  assert.equal((await sharePost(req('/api/admin/shared-library/a-private',tokens[1],'POST',{shared:true}),context('a-private'))).status,403);
  assert.equal((await share('a-private')).status,404);
  assert.equal((await sharePost(req('/api/admin/shared-library/source-one',tokens[0],'POST',{shared:true,extra:1}),context('source-one'))).status,422);
  assert.equal((await sharePost(req('/api/admin/shared-library/source-one',tokens[0],'POST',{shared:true},{origin:'https://evil.test','sec-fetch-site':'cross-site'}),context('source-one'))).status,403);
  assert.equal((await sharedGet(req('/api/shared-library?userId=shared-admin',tokens[1]))).status,403);
  const id=await published();
  assert.equal((await copyPost(req('/api/shared-library/copy',tokens[1],'POST',{ids:[id],userId:owners[0]},{'idempotency-key':randomUUID()}))).status,403);
  for(const ids of [[],[id,id],Array.from({length:21},()=>randomUUID())])assert.equal((await copy(ids)).status,422);
  assert.equal((await copyPost(req('/api/shared-library/copy',tokens[1],'POST',{ids:[id]}))).status,422);
  assert.equal((await copy(['source-one'])).status,422);
  assert.equal((await copyPost(req('/api/shared-library/copy',tokens[1],'POST',{ids:[id]},{'idempotency-key':randomUUID(),'sec-fetch-site':'cross-site'}))).status,403);
});
test('copy creates independent USER READY items and fresh private image/video bytes in order, no publication',async()=>{
  await fixtureMedia();const id=await published();const response=await copy([id]);assert.equal(response.status,201);const {items:[item]}=await response.json();
  assert.equal(item.status,'READY');assert.equal(item.sourcePostId,null);assert.equal(item.text,'Shared body');assert.equal(item.mediaIds.length,2);
  assert.ok(!JSON.stringify(item).includes('source-one'));
  const assets=await db.select().from(mediaAssets).where(eq(mediaAssets.userId,owners[1]));
  for(let i=0;i<2;i++){const asset=assets.find(a=>a.id===item.mediaIds[i])!;assert.ok(asset);assert.ok(asset.storageKey.startsWith('users/'));assert.deepEqual(objectBytes.get(asset.storageKey),objectBytes.get(`private/source-one-asset-${i}`));assert.equal(asset.originalName,`asset-${i}.${i?'mp4':'png'}`);}
  assert.equal((await listMediaAssetsWithPreview(owners[2])).length,0);
  for(const table of [posts,postTargets,publications])assert.equal((await db.select().from(table)).length,0);
  await share('source-one',false);await deleteLibraryItem(owners[0],'source-one');assert.equal((await listLibraryItems(owners[1])).find(x=>x.id===item.id)?.text,'Shared body');
});

test('an accepted WebM upload remains visible and copies its private bytes',async()=>{
  const bytes=Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3,4]);
  const asset=await createMediaAsset(owners[0],new File([bytes],'clip.webm',{type:'video/webm'}));
  await updateLibraryItem(owners[0],'source-one',{text:'WebM',status:'READY',mediaIds:[asset.id]});
  const id=await published();assert.equal((await catalog())[0].media[0].mimeType,'video/webm');
  puts=[];const response=await copy([id]);assert.equal(response.status,201);
  const item=(await response.json()).items[0];assert.equal(item.mediaIds.length,1);
  const [copied]=await db.select().from(mediaAssets).where(eq(mediaAssets.id,item.mediaIds[0]));
  assert.equal(copied.mimeType,'video/webm');assert.equal(copied.originalName,'clip.webm');
  assert.deepEqual(objectBytes.get(copied.storageKey),bytes);
});

// The database really executes COMMIT; only its fulfilled driver response is lost.
// Subsequent SELECT rejection models an unavailable outcome reconciliation read.
function loseCommitResponse(unreadableOutcome=false) {
  let armed=true,lost=false;
  const query=Client.prototype.query;
  return test.mock.method(Client.prototype,'query',function(this:Client,...args:unknown[]) {
    const command=typeof args[0]==='string'?args[0]:(args[0] as {text?:string}).text??'';
    if(lost && unreadableOutcome && /^select/i.test(command)){
      const failure=new Error('fixture reconciliation unavailable'),callback=args.at(-1);
      if(typeof callback==='function'){queueMicrotask(()=>callback(failure));return;}
      return Promise.reject(failure);
    }
    const result=Reflect.apply(query,this,args);
    if(armed && /^commit$/i.test(command)) {
      armed=false;
      return Promise.resolve(result).then(()=>{lost=true;throw new Error('fixture lost COMMIT response');});
    }
    return result;
  });
}

test('lost COMMIT response resolves the durable receipt without deleting committed media',async()=>{
  await fixtureMedia();const id=await published(),key=randomUUID();const fault=loseCommitResponse();
  let response:Response;
  try{response=await copy([id],tokens[1],key);}finally{fault.mock.restore();}
  assert.equal(response.status,201);const first=await response.json();
  assert.equal(puts.length,2);assert.deepEqual(deletes,[]);
  const assets=await db.select().from(mediaAssets).where(eq(mediaAssets.userId,owners[1]));
  assert.equal(assets.length,2);for(const asset of assets)assert.ok(objectBytes.has(asset.storageKey));
  assert.deepEqual(await (await copy([id],tokens[1],key)).json(),first);assert.equal(puts.length,2);
});

test('unreadable COMMIT outcome preserves media and explicitly requires the same retry key',async()=>{
  await fixtureMedia();const id=await published(),key=randomUUID();const fault=loseCommitResponse(true);
  let response:Response;
  try{response=await copy([id],tokens[1],key);}finally{fault.mock.restore();}
  assert.equal(response.status,502);const failure=await response.json();
  assert.equal(failure.code,'SHARED_COPY_OUTCOME_UNKNOWN');assert.match(failure.error,/same.*key/i);
  assert.doesNotMatch(JSON.stringify(failure),/fixture|private\/|users\//);assert.deepEqual(deletes,[]);
  const retried=await copy([id],tokens[1],key);assert.equal(retried.status,201);assert.equal(puts.length,2);
  const assets=await db.select().from(mediaAssets).where(eq(mediaAssets.userId,owners[1]));
  assert.equal(assets.length,2);for(const asset of assets)assert.ok(objectBytes.has(asset.storageKey));
});
test('durable receipt replays before source validation, conflicts on input mismatch and retains deleted-result 410',async()=>{
  const id=await published(),key=randomUUID();const [a,b]=await Promise.all([copy([id],tokens[1],key),copy([id],tokens[1],key)]);assert.equal(a.status,201);assert.equal(b.status,201);const first=await a.json();assert.deepEqual(await b.json(),first);
  await share('source-two');const second=(await catalog()).find((x:{id:string})=>x.id!==id).id;
  assert.equal((await copy([second],tokens[1],key)).status,409);
  await share('source-one',false);await deleteLibraryItem(owners[0],'source-one');assert.deepEqual(await (await copy([id],tokens[1],key)).json(),first);
  await deleteLibraryItem(owners[1],first.items[0].id);assert.equal((await copy([id],tokens[1],key)).status,410);assert.equal((await copy([id],tokens[2],key)).status,404);
});
test('catalog reflects source edit and READY lifecycle, deleted/unshared materials cannot be copied',async()=>{
  const id=await published();await updateLibraryItem(owners[0],'source-one',{text:'Edited',title:'New',status:'READY',mediaIds:[]});assert.equal((await catalog())[0].text,'Edited');
  await updateLibraryItem(owners[0],'source-one',{text:'Archived',status:'ARCHIVED',mediaIds:[]});assert.deepEqual(await catalog(),[]);assert.equal((await copy([id])).status,404);assert.equal((await share()).status,409);
  await updateLibraryItem(owners[0],'source-one',{text:'Ready',status:'READY',mediaIds:[]});await share('source-one',false);assert.deepEqual(await catalog(),[]);assert.equal((await copy([id])).status,404);
});
test('malformed foreign media graph rejects whole catalog and batch before any object writes',async()=>{
  await fixtureMedia('source-one',owners[2]);await published().catch(()=>{});
  assert.equal((await sharedGet(req('/api/shared-library',tokens[1]))).status,409);
  const rows=await getPool().query('SELECT id FROM shared_library_items');const id=rows.rows[0].id;
  assert.equal((await copy([id])).status,409);assert.deepEqual(puts,[]);
});
test('atomic batch rollback compensates even an uncertain successful PUT and returns sanitized cleanup failure',async()=>{
  await fixtureMedia();const id=await published();failPut=2;
  assert.equal((await copy([id])).status,502);assert.equal(puts.length,2);assert.deepEqual(deletes.sort(),[...puts].sort());assert.equal((await db.select().from(mediaAssets).where(eq(mediaAssets.userId,owners[1]))).length,0);assert.equal((await listLibraryItems(owners[1])).length,1);
  puts=[];deletes=[];failPut=1;failDelete=true;const response=await copy([id]);assert.equal(response.status,502);const failure=await response.json();assert.equal(failure.code,'SHARED_COPY_CLEANUP_FAILED');assert.doesNotMatch(JSON.stringify(failure),/fixture-secret|private\/|users\//);
});

for(const method of ['PUT','DELETE'] as const)test(`stalled shared-copy ${method} is actually aborted at its scoped deadline and releases source locks`,async()=>{
  await fixtureMedia();const id=await published();stallMutation=method;if(method==='DELETE')failPut=1;
  let enter!:()=>void,closed!:()=>void;
  const entered=new Promise<void>(resolve=>{enter=resolve;}),cancelled=new Promise<void>(resolve=>{closed=resolve;});
  mutationEntered=enter;mutationClosed=closed;
  const deadlines=new Map<AbortSignal,AbortController>();
  const timeout=test.mock.method(AbortSignal,'timeout',(milliseconds:number)=>{
    assert.equal(milliseconds,30_000);const controller=new AbortController();deadlines.set(controller.signal,controller);return controller.signal;
  });
  const storage=getObjectStorage(),put=storage.put,remove=storage.delete;
  let putSignal:AbortSignal|undefined,deleteSignal:AbortSignal|undefined;
  const putSpy=test.mock.method(storage,'put',async(key:string,bytes:Uint8Array,type:string,signal?:AbortSignal)=>{
    putSignal=signal;return Reflect.apply(put,storage,[key,bytes,type,signal]);
  });
  const deleteSpy=test.mock.method(storage,'delete',async(key:string,signal?:AbortSignal)=>{
    deleteSignal=signal;return Reflect.apply(remove,storage,[key,signal]);
  });
  const pending=copy([id]);let response:Response;
  try{
    await entered;
    const signal=method==='PUT'?putSignal:deleteSignal;
    assert.ok(signal instanceof AbortSignal,`${method} must carry its cancellation signal`);
    assert.ok(deadlines.has(signal),'copy mutation must use its 30 second deadline');
    deadlines.get(signal)!.abort(new DOMException('Fixture deadline reached','TimeoutError'));
    await cancelled;response=await pending;
    assert.equal(response.status,502);
    assert.equal((await response.json()).code,method==='PUT'?'SHARED_COPY_FAILED':'SHARED_COPY_CLEANUP_FAILED');
    assert.ok(deleteSignal && deadlines.has(deleteSignal),'compensating DELETE needs an independent deadline');
    assert.equal((await db.select().from(mediaAssets).where(eq(mediaAssets.userId,owners[1]))).length,0);
    assert.equal((await listLibraryItems(owners[1])).length,1);
    if(method==='PUT')assert.ok(puts.every(key=>!objectBytes.has(key)),'aborted successful PUT must be compensated');
  }finally{
    for(const res of stalledResponses)res.destroy();await pending;
    timeout.mock.restore();putSpy.mock.restore();deleteSpy.mock.restore();stallMutation=undefined;failPut=0;
  }
  assert.equal((await catalog()).length,1);assert.equal((await copy([id])).status,201);
});
test('checksum mismatch and a missing share roll back the complete multi-item batch',async()=>{
  await fixtureMedia();const id=await published();await share('source-two');const second=(await catalog()).find((x:{id:string})=>x.id!==id).id;
  assert.equal((await copy([second,randomUUID()])).status,404);assert.deepEqual(puts,[]);
  await db.update(mediaAssets).set({checksum:'bad'}).where(eq(mediaAssets.id,'source-one-asset-1'));assert.equal((await copy([second,id])).status,502);assert.equal((await listLibraryItems(owners[1])).length,1);assert.deepEqual(deletes.sort(),[...puts].sort());
});
test('blocked and expired native sessions cannot read/copy',async()=>{
  const id=await published();await db.update(users).set({accessState:'BLOCKED'}).where(eq(users.id,owners[1]));assert.equal((await copy([id])).status,401);assert.equal((await sharedGet(req('/api/shared-library',tokens[1]))).status,401);
  await db.update(sessions).set({expiresAt:new Date(0)}).where(eq(sessions.userId,owners[2]));assert.equal((await copy([id],tokens[2])).status,401);
});
async function waitBlocked(pid:number) {
  const deadline=Date.now()+5000;while(Date.now()<deadline){const result=await getPool().query<{blocked:boolean}>('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS blocked',[pid]);if(result.rows[0].blocked)return;await delay(10);}assert.fail('native lock wait was not observed');
}
test('actor lifecycle is rechecked after waiting for user lock',async()=>{
  const id=await published(),client=await getPool().connect();let pending:Promise<Response>|undefined;
  try{await client.query('BEGIN');await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[owners[1]]);const {rows:[{pid}]}=await client.query('SELECT pg_backend_pid() AS pid');pending=copy([id]);await waitBlocked(pid);await client.query("UPDATE users SET access_state='BLOCKED',session_version=session_version+1 WHERE id=$1",[owners[1]]);await client.query('COMMIT');assert.equal((await pending).status,401);assert.deepEqual(puts,[]);}finally{await client.query('ROLLBACK');client.release();await pending;}
});
for(const mutation of ['unshare','edit','delete'] as const)test(`copy holds source lock through byte copy against concurrent ${mutation}`,async()=>{
  await fixtureMedia();const id=await published();let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>{enter=r;});finishGet=new Promise<void>(r=>{release=r;});getEntered=enter;
  const copying=copy([id]);let changing:Promise<unknown>|undefined;
  try{
    await entered;
    const activity=await db.execute(sql`select pid from pg_stat_activity where datname=current_database() and state='idle in transaction' and query like '%insert into "library_items"%'`);assert.equal(activity.rows.length,1);
    changing=mutation==='unshare'?share('source-one',false):mutation==='edit'?updateLibraryItem(owners[0],'source-one',{text:'Race edit',status:'READY',mediaIds:[]}):deleteLibraryItem(owners[0],'source-one');
    await waitBlocked(Number(activity.rows[0].pid));release();const response=await copying;assert.equal(response.status,201);assert.equal((await response.json()).items[0].text,'Shared body');await changing;
  }finally{release();await copying;await changing;}
});
