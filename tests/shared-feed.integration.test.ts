import test,{before,beforeEach,after,mock} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {Client} from 'pg';
import {eq} from 'drizzle-orm';
import {getDb,closeDb} from '../db/index.ts';
import * as schema from '../db/schema.ts';
import {resetServerEnvForTests} from '../lib/server/env.ts';
import {owner,other,admin,configured,token,seedBatchFixture,removeSession,blocker,waitForBlocked} from './helpers/library-batch-db.ts';
const path='../lib/server/shared-feed.ts';
const api=await import(path).catch(()=>null);
const db=getDb(),bytes=new Map<string,Buffer>();let puts:string[]=[],deletes:string[]=[],failPut=false;
let onGet:(()=>Promise<void>)|undefined;
const server=createServer(async(req,res)=>{
 const key=decodeURIComponent(new URL(req.url!,'http://fixture').pathname.slice('/fixtures/'.length));
 if(req.method==='PUT'){const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));bytes.set(key,Buffer.concat(chunks));puts.push(key);if(failPut){req.socket.destroy();return;}res.end();return;}
 if(req.method==='DELETE'){deletes.push(key);bytes.delete(key);res.end();return;}
 await onGet?.();res.end(bytes.get(key));
});
function request(who=owner,method='POST'){return new Request('http://planly.test/api/shared-feed/decisions',{method,headers:{cookie:`planly_session=${token(who)}`}});}
let shareId:string,revision:string;const mirrors:unknown[][]=[];
const options={mirrorQueue:async(changes:unknown[])=>{assert.equal((await db.select().from(schema.posts)).length,1,'queue only after commit');mirrors.push(changes);}};
function intent(decision='LIKE',expectedActorId=owner){return {expectedActorId,operationId:randomUUID(),shareId,sourceRevision:revision,decision,...(decision==='LIKE'?{approval:{providers:['telegram','max'],scheduledAt:'2030-01-01T10:00:00.000Z',inputMethod:'button'}}:{})};}
async function decide(input=intent(),who=owner){return api.commitSharedFeedDecision(request(who),input,options);}
const code=(value:string)=>(e:unknown)=>!!e&&typeof e==='object'&&'code'in e&&e.code===value;
async function counts(){return {posts:(await db.select().from(schema.posts)).length,receipts:(await db.select().from(schema.sharedFeedDecisions)).length,publications:(await db.select().from(schema.publications)).length,copies:(await db.select().from(schema.libraryItems)).filter(x=>x.title==='Shared fixture'&&x.userId!==admin).length};}
before(async()=>{assert.ok(api?.commitSharedFeedDecision,'atomic shared feed service must exist');await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();assert.ok(addr&&typeof addr!=='string');Object.assign(process.env,{S3_ENDPOINT:`http://127.0.0.1:${addr.port}`,S3_REGION:'fixture',S3_BUCKET:'fixtures',S3_ACCESS_KEY_ID:'fixture',S3_SECRET_ACCESS_KEY:'fixture'});delete process.env.S3_PUBLIC_ENDPOINT;resetServerEnvForTests();});
beforeEach(async()=>{
 await seedBatchFixture();bytes.clear();puts=[];deletes=[];mirrors.length=0;onGet=undefined;failPut=false;
 const source='shared-source',body=Buffer.from('independent shared bytes');bytes.set('original',body);shareId=randomUUID();revision='2026-10-19T10:00:00.000Z';
 await db.insert(schema.libraryItems).values({id:source,userId:admin,title:'Shared fixture',bodyText:'Shared body',updatedAt:new Date(revision)});
 await db.insert(schema.mediaAssets).values({id:'shared-media',userId:admin,storageKey:'original',originalName:'image.png',mimeType:'image/png',byteSize:body.length,checksum:createHash('sha256').update(body).digest('hex'),width:100,height:100});
 await db.insert(schema.libraryItemMedia).values({libraryItemId:source,mediaId:'shared-media',position:0});await db.insert(schema.sharedLibraryItems).values({id:shareId,sourceId:source});
});
after(async()=>{try{if(api)await db.delete(schema.users);}finally{await closeDb();if(server.listening)await new Promise<void>(r=>server.close(()=>r()));resetServerEnvForTests();}});
test('one direct LIKE atomically copies bytes, creates personal Post, binding publications and swipe receipt',async()=>{
 const saved=await decide();assert.equal(saved.replayed,false);assert.deepEqual(await counts(),{posts:1,receipts:1,publications:2,copies:1});assert.equal(mirrors.length,1);
 const [post]=await db.select().from(schema.posts),[copy]=await db.select().from(schema.libraryItems).where(eq(schema.libraryItems.id,saved.receipt.personalItemId));assert.equal(post.userId,owner);assert.equal(post.sourceLibraryItemId,copy.id);assert.equal(copy.status,'USED');assert.equal(copy.bodyText,'Shared body');
 const [asset]=await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.storageKey,puts[0]));assert.equal(asset.userId,owner);assert.deepEqual(bytes.get(asset.storageKey),bytes.get('original'));
 assert.equal((await db.select().from(schema.swipeDecisionReceipts)).length,1);for(const p of await db.select().from(schema.publications))assert.equal(p.socialBindingRevision,1);
 assert.equal((await api.listSharedFeed(request(owner,'GET'))).length,0);assert.equal((await api.listSharedFeed(request(other,'GET'))).length,1);
});
test('DISLIKE creates an independent private archive but no Post, publication or job',async()=>{
 const input=intent('DISLIKE'),saved=await decide(input);assert.deepEqual(await counts(),{posts:0,receipts:1,publications:0,copies:1});assert.equal(puts.length,1);assert.equal(mirrors.length,0);
 const [copy]=await db.select().from(schema.libraryItems).where(eq(schema.libraryItems.id,saved.receipt.personalItemId!));assert.equal(copy.userId,owner);assert.equal(copy.status,'ARCHIVED');
 assert.deepEqual((await decide(input)).receipt,saved.receipt);assert.equal(puts.length,1);
 assert.equal((await api.listSharedFeed(request(owner,'GET'))).length,0);assert.equal((await api.listSharedFeed(request(other,'GET'))).length,1);
 await decide(intent('DISLIKE',other),other);assert.equal((await counts()).receipts,2);assert.equal((await counts()).copies,2);
 await db.delete(schema.sharedLibraryItems).where(eq(schema.sharedLibraryItems.id,shareId));
 assert.equal((await db.select().from(schema.libraryItems).where(eq(schema.libraryItems.id,copy.id)))[0].status,'ARCHIVED');
});
test('same operation concurrent replay is identical; changed payload and different key conflict',async()=>{const input=intent();const [a,b]=await Promise.all([decide(input),decide(input)]);assert.deepEqual(a.receipt,b.receipt);assert.equal(Number(a.replayed)+Number(b.replayed),1);await assert.rejects(decide({expectedActorId:input.expectedActorId,operationId:input.operationId,shareId:input.shareId,sourceRevision:input.sourceRevision,decision:'DISLIKE'}),code('SHARED_FEED_OPERATION_CONFLICT'));await assert.rejects(decide({...input,operationId:randomUUID()}),code('SHARED_FEED_ALREADY_DECIDED'));assert.equal((await counts()).posts,1);assert.equal(puts.length,1);});
test('different concurrent keys produce exactly one outcome',async()=>{const results=await Promise.allSettled([decide(),decide()]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await counts()).posts,1);assert.equal(puts.length,1);});
test('stale revision and unshared opaque source fail before copy; historical replay survives source deletion',async()=>{await assert.rejects(decide({...intent(),sourceRevision:'2026-10-18T10:00:00.000Z'}),code('SHARED_FEED_SOURCE_STALE'));const input=intent(),saved=await decide(input);await db.delete(schema.libraryItems).where(eq(schema.libraryItems.id,'shared-source'));assert.deepEqual((await decide(input)).receipt,saved.receipt);await assert.rejects(decide(intent('DISLIKE',other),other),code('SHARED_SOURCE_UNAVAILABLE'));assert.equal(puts.length,1);});
test('deleted personal Post or copy remains terminal and cannot resurrect from source',async()=>{const input=intent(),saved=await decide(input);await db.delete(schema.posts).where(eq(schema.posts.id,saved.receipt.postId));await assert.rejects(decide(input),code('SHARED_FEED_RESULT_DELETED'));await assert.rejects(api.readSharedFeedDecision(request(),input.operationId),code('SHARED_FEED_RESULT_DELETED'));await assert.rejects(decide(),code('SHARED_FEED_ALREADY_DECIDED'));assert.equal(puts.length,1);});
test('operation lookup is private to owner, including ADMIN non-owner',async()=>{const saved=await decide();for(const who of [other,admin])await assert.rejects(api.readSharedFeedDecision(request(who),saved.receipt.operationId),code('SHARED_FEED_RESULT_NOT_FOUND'));});
for(const who of [configured,admin])test(`individual approval rights retained for ${who}`,async()=>{await decide(intent('LIKE',who),who);assert.equal((await counts()).posts,1);});
test('USER missing binding is denied atomically with storage cleanup',async()=>{await db.delete(schema.socialBindings).where(eq(schema.socialBindings.userId,owner));await assert.rejects(decide());assert.deepEqual(await counts(),{posts:0,receipts:0,publications:0,copies:0});assert.equal(mirrors.length,0);for(const key of puts)assert.equal(bytes.has(key),false);});
test('disconnected account cannot silently publish now',async()=>{await db.update(schema.socialAccounts).set({enabled:false}).where(eq(schema.socialAccounts.userId,owner));await assert.rejects(decide());assert.equal((await counts()).posts,0);assert.equal(puts.length,0);});
test('storage failure and checksum corruption roll back all rows and clean attempted writes',async()=>{failPut=true;await assert.rejects(decide(),code('SHARED_FEED_FAILED'));assert.equal((await counts()).copies,0);assert.deepEqual(deletes,puts);failPut=false;bytes.set('original',Buffer.from('corrupt'));await assert.rejects(decide(),code('SHARED_FEED_FAILED'));assert.equal((await counts()).receipts,0);});
test('logout during storage causes final recheck to roll back copied media and Post',async()=>{onGet=async()=>{await removeSession();};await assert.rejects(decide(),e=>e instanceof Error&&e.name==='UnauthorizedError');assert.deepEqual(await counts(),{posts:0,receipts:0,publications:0,copies:0});assert.deepEqual(deletes,puts);});
test('actor lock wait rechecks lifecycle before admission',async()=>{const held=await blocker('select id from users where id=$1 for update',[owner]);const pending=decide();const rejected=assert.rejects(pending);await waitForBlocked(held.pid);await held.client.query("update users set access_state='BLOCKED' where id=$1",[owner]);await held.release();await rejected;assert.equal(puts.length,0);});
test('lost COMMIT acknowledgement preserves committed media and recovers the exact operation',async()=>{const input=intent(),query=Client.prototype.query;let lost=false;const patch=mock.method(Client.prototype,'query',function(this:Client,...args:unknown[]){const command=typeof args[0]==='string'?args[0]:(args[0] as {text:string}).text;const result=Reflect.apply(query,this,args);if(!lost&&/^commit$/i.test(command)){lost=true;return Promise.resolve(result).then(()=>{throw new Error('Lost ack');});}return result;});let saved;try{saved=await decide(input);}finally{patch.mock.restore();}assert.equal(lost,true);assert.equal(deletes.length,0);assert.deepEqual((await decide(input)).receipt,saved.receipt);assert.equal(puts.length,1);assert.equal((await counts()).publications,2);});

test('unreadable COMMIT outcome keeps bytes and is recoverable only by the original operation',async()=>{
 const input=intent(),query=Client.prototype.query;let lost=false;
 const patch=mock.method(Client.prototype,'query',function(this:Client,...args:unknown[]){const command=typeof args[0]==='string'?args[0]:(args[0] as {text:string}).text;if(lost&&/^select/i.test(command)){const error=new Error('Outcome unavailable'),callback=args.at(-1);if(typeof callback==='function'){queueMicrotask(()=>callback(error));return;}return Promise.reject(error);}const result=Reflect.apply(query,this,args);if(!lost&&/^commit$/i.test(command)){lost=true;return Promise.resolve(result).then(()=>{throw new Error('Lost ack');});}return result;});
 try{await assert.rejects(decide(input),code('SHARED_FEED_OUTCOME_UNKNOWN'));}finally{patch.mock.restore();}
 assert.equal(deletes.length,0);assert.equal(bytes.has(puts[0]),true);const saved=await api.readSharedFeedDecision(request(),input.operationId);assert.deepEqual((await decide(input)).receipt,saved.receipt);assert.equal(puts.length,1);
});
test('source edit or unshare that wins source lock invalidates fresh consent',async()=>{
 const held=await blocker('select id from library_items where id=$1 for update',['shared-source']);const pending=decide();const rejected=assert.rejects(pending,code('SHARED_FEED_SOURCE_STALE'));
 await waitForBlocked(held.pid);await held.client.query("update library_items set updated_at=updated_at+interval '1 second' where id=$1",['shared-source']);await held.release();await rejected;assert.equal(puts.length,0);
});
test('unshare that wins source lock fails without personal result',async()=>{
 const held=await blocker('select id from library_items where id=$1 for update',['shared-source']);const pending=decide();const rejected=assert.rejects(pending,code('SHARED_SOURCE_UNAVAILABLE'));
 await waitForBlocked(held.pid);await held.client.query('delete from shared_library_items where id=$1',[shareId]);await held.release();await rejected;assert.equal(puts.length,0);
});
test('logout during historical result row wait prevents a successful replay',async()=>{
 const input=intent(),saved=await decide(input),held=await blocker('select id from posts where id=$1 for update',[saved.receipt.postId]);const pending=decide(input);const rejected=assert.rejects(pending,e=>e instanceof Error&&e.name==='UnauthorizedError');await waitForBlocked(held.pid);await removeSession();await held.release();await rejected;assert.equal((await counts()).posts,1);assert.equal(puts.length,1);
});
test('whole-minute occupied slot rejects fresh revision without another copy',async()=>{
 await decide();await db.update(schema.libraryItems).set({updatedAt:new Date('2026-10-20T10:00:00.000Z')}).where(eq(schema.libraryItems.id,'shared-source'));revision='2026-10-20T10:00:00.000Z';await assert.rejects(decide(),e=>e instanceof Error&&e.name==='PlannerSlotConflictError');assert.equal(puts.length,1);assert.equal((await counts()).posts,1);
});
test('ordered copies retain exact bytes and checksum with distinct private identities',async()=>{
 const second=Buffer.from('second image bytes');bytes.set('second',second);await db.insert(schema.mediaAssets).values({id:'shared-second',userId:admin,storageKey:'second',originalName:'second.png',mimeType:'image/png',byteSize:second.length,checksum:createHash('sha256').update(second).digest('hex'),width:100,height:100});await db.insert(schema.libraryItemMedia).values({libraryItemId:'shared-source',mediaId:'shared-second',position:1});
 const saved=await decide(),links=await db.select().from(schema.postMedia).where(eq(schema.postMedia.postId,saved.receipt.postId));links.sort((a,b)=>a.position-b.position);assert.equal(links.length,2);
 for(const [position,link] of links.entries()){const [asset]=await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id,link.mediaId));assert.equal(asset.userId,owner);assert.deepEqual(bytes.get(asset.storageKey),bytes.get(position?'second':'original'));assert.equal(asset.checksum,createHash('sha256').update(bytes.get(asset.storageKey)!).digest('hex'));}
});
test('queue failure does not erase durable consent and replay never creates duplicate jobs',async()=>{
 const input=intent();let calls=0;const saved=await api.commitSharedFeedDecision(request(),input,{mirrorQueue:async()=>{calls++;throw new Error('Synthetic queue unavailable');}});assert.equal(calls,1);assert.equal((await counts()).publications,2);assert.deepEqual((await decide(input)).receipt,saved.receipt);assert.equal(mirrors.length,0);
});
test('native HTTP routes enforce real session, strict identity and CSRF, and own result shape',async()=>{
 const route=await import('../app/api/shared-feed/decisions/route.ts'),get=await import('../app/api/shared-feed/decisions/[operationId]/route.ts');
 const input=intent('DISLIKE');const send=(body:unknown,cookie=token(),extra={})=>route.POST(new Request('http://planly.test/api/shared-feed/decisions',{method:'POST',headers:{cookie:`planly_session=${cookie}`,'content-type':'application/json',...extra},body:JSON.stringify(body)}));
 assert.equal((await send(input,'')).status,401);assert.equal((await send({...input,userId:other})).status,403);assert.equal((await send({...input,extra:true})).status,422);assert.equal((await send(input,token(),{origin:'https://evil.test','sec-fetch-site':'cross-site'})).status,403);
 const response=await send(input);assert.equal(response.status,201);const saved=await response.json();assert.deepEqual(Object.keys(saved).sort(),['receipt','replayed']);const recovered=await get.GET(request(owner,'GET'),{params:Promise.resolve({operationId:input.operationId})});assert.equal(recovered.status,200);assert.deepEqual((await recovered.json()).receipt,saved.receipt);assert.equal((await get.GET(request(other,'GET'),{params:Promise.resolve({operationId:input.operationId})})).status,404);
});
test('two USER approvals create independent copies, media, Posts and bindings for the same shared revision',async()=>{
 const a=await decide();const b=await api.commitSharedFeedDecision(request(other),intent('LIKE',other),{mirrorQueue:async()=>undefined});
 assert.notEqual(a.receipt.personalItemId,b.receipt.personalItemId);assert.notEqual(a.receipt.postId,b.receipt.postId);assert.equal((await counts()).posts,2);assert.equal((await counts()).publications,4);assert.equal(new Set(puts).size,2);
 for(const [who,result] of [[owner,a],[other,b]] as const){const [post]=await db.select().from(schema.posts).where(eq(schema.posts.id,result.receipt.postId));assert.equal(post.userId,who);const pubs=await db.select().from(schema.publications).where(eq(schema.publications.postId,post.id));assert.equal(pubs.length,2);for(const row of pubs){assert.equal(row.userId,who);assert.equal(row.socialBindingRevision,1);}}
});
test('known pre-COMMIT failure rolls back rows and deletes only uncommitted copied objects',async()=>{
 const query=Client.prototype.query;let failed=false;const patch=mock.method(Client.prototype,'query',function(this:Client,...args:unknown[]){const command=typeof args[0]==='string'?args[0]:(args[0] as {text:string}).text;if(!failed&&/^commit$/i.test(command)){failed=true;return Promise.reject(new Error('Synthetic precommit failure'));}return Reflect.apply(query,this,args);});
 try{await assert.rejects(decide(),code('SHARED_FEED_FAILED'));}finally{patch.mock.restore();}
 assert.equal(failed,true);assert.deepEqual(await counts(),{posts:0,receipts:0,publications:0,copies:0});assert.deepEqual(deletes,puts);assert.equal(bytes.has('original'),true);assert.equal(mirrors.length,0);
});
test('session expiry during copied-byte IO rolls back the whole consent',async()=>{
 onGet=async()=>{await db.update(schema.sessions).set({expiresAt:new Date('2020-01-01')}).where(eq(schema.sessions.userId,owner));};await assert.rejects(decide(),e=>e instanceof Error&&e.name==='UnauthorizedError');assert.deepEqual(await counts(),{posts:0,receipts:0,publications:0,copies:0});assert.deepEqual(deletes,puts);
});
for(const decision of ['LIKE','DISLIKE'])test(`stale owner A ${decision} intent with owner B cookie cannot mutate B or acknowledge A`,async()=>{
 const ownerAIntent=intent(decision);
 const outcome=await api.commitSharedFeedDecision(request(other),ownerAIntent,options).then((result:unknown)=>({result,error:undefined}),(error:unknown)=>({result:undefined,error}));
 assert.deepEqual(await counts(),{posts:0,receipts:0,publications:0,copies:0},'a stale tab cannot use the replacement session to create another owner result');
 assert.equal(outcome.result,undefined,'old owner journal must never receive a successful other-owner acknowledgement');
 assert.ok(code('SHARED_FEED_ACTOR_CHANGED')(outcome.error));
 assert.deepEqual(puts,[]);assert.deepEqual(mirrors,[]);
});
test('actor precondition wins before historical same-operation replay',async()=>{
 const inputA=intent('DISLIKE'),inputB={...inputA,expectedActorId:other};
 await api.commitSharedFeedDecision(request(other),inputB,options);
 const before=await counts(),beforePuts=[...puts];
 assert.deepEqual(before,{posts:0,receipts:1,publications:0,copies:1});assert.equal(beforePuts.length,1);
 await assert.rejects(api.commitSharedFeedDecision(request(other),inputA,options),code('SHARED_FEED_ACTOR_CHANGED'));
 assert.deepEqual(await counts(),before);assert.deepEqual(puts,beforePuts);assert.deepEqual(mirrors,[]);
});
test('HTTP actor precondition permits matching context but rejects a switched cookie without receipt',async()=>{
 const route=await import('../app/api/shared-feed/decisions/route.ts');
 const inputA=intent('DISLIKE'),send=(body:unknown,who=other)=>route.POST(new Request('http://planly.test/api/shared-feed/decisions',{method:'POST',headers:{cookie:`planly_session=${token(who)}`,'content-type':'application/json'},body:JSON.stringify(body)}));
 const mismatch=await send(inputA);assert.equal(mismatch.status,409);assert.equal((await mismatch.json()).code,'SHARED_FEED_ACTOR_CHANGED');
 assert.deepEqual(await counts(),{posts:0,receipts:0,publications:0,copies:0});
 const missing=structuredClone(inputA) as Partial<typeof inputA>;delete missing.expectedActorId;assert.equal((await send(missing)).status,422);
 const matching=await send({...inputA,expectedActorId:other});assert.equal(matching.status,201);const receipt=(await matching.json()).receipt;assert.equal(receipt.operationId,inputA.operationId);
 const [archived]=await db.select().from(schema.libraryItems).where(eq(schema.libraryItems.id,receipt.personalItemId));assert.equal(archived.userId,other);assert.equal(archived.status,'ARCHIVED');
 assert.equal(puts.length,1);assert.deepEqual(await counts(),{posts:0,receipts:1,publications:0,copies:1});assert.deepEqual(mirrors,[]);
});
