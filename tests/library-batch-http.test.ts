import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq,inArray} from 'drizzle-orm';
import {getDb,closeDb} from '../db/index.ts';
import {users,sessions,socialAccounts,socialBindings,libraryItems,posts,publications,libraryBatchConsentOperations} from '../db/schema.ts';
import {sessionTokenHash,SESSION_COOKIE_NAME} from '../lib/server/auth/session.ts';
import {socialConnectionConfig} from '../lib/server/social-connections/config.ts';
import {libraryBatchApiError,libraryBatchPreview,libraryBatchCommit,libraryBatchOperation} from '../lib/server/library-batch-http.ts';
import {LibraryBatchError} from '../lib/server/library-batch.ts';
import {ForbiddenError} from '../lib/server/auth/access.ts';
import {createPost,updatePost} from '../lib/server/posts.ts';
import {removePublicationJob,closePublicationQueue} from '../lib/server/scheduler/queue.ts';
import {closeRedisConnection} from '../lib/server/scheduler/redis.ts';

const origin='http://127.0.0.1:4219';
function request(path:string,raw='',body?:unknown,headers:Record<string,string>={}){return new Request(`${origin}${path}`,{method:body===undefined?'GET':'POST',headers:{cookie:`${SESSION_COOKIE_NAME}=${raw}`,origin,'content-type':'application/json','x-planly-library-batch':'1',...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});}
const settings={startDate:'2030-01-01',endDate:'2030-01-01',weekdays:[1,2,3,4,5,6,7],times:['10:00','18:00']};
async function body(response:Response,status:number){assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');return response.json();}

test('HTTP uncertainty projection distinguishes service fresh rollback from request rejection',async()=>{
 for(const code of ['BATCH_FORBIDDEN','BATCH_UNAVAILABLE','BATCH_PREVIEW_STALE','BATCH_ACCOUNT_UNAVAILABLE','BATCH_CONTENT_INVALID','BATCH_SLOT_CONFLICT'] as const){assert.equal((await libraryBatchApiError(new LibraryBatchError(code),true).json()).commitApplied,false);assert.equal((await libraryBatchApiError(new LibraryBatchError(code)).json()).commitApplied,undefined);}
 for(const code of ['BATCH_INVALID','BATCH_UNAUTHORIZED','BATCH_OPERATION_CONFLICT','BATCH_RESULT_NOT_FOUND','BATCH_RESULT_UNCERTAIN','BATCH_RESULT_DELETED'] as const)assert.equal((await libraryBatchApiError(new LibraryBatchError(code),true).json()).commitApplied,undefined);
 for(const error of [new ForbiddenError(),new Error('sensitive database statement'),new TypeError('private driver data')]){const result=await libraryBatchApiError(error,true).json();assert.equal(result.commitApplied,undefined);assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes('sensitive'));}
});

test('canonical HTTPS origin override and identity headers fail closed without rollback claims',async()=>{
 const previous=process.env.PLANLY_PUBLIC_ORIGIN;try{
  process.env.PLANLY_PUBLIC_ORIGIN='https://planly.example.test';
  const accepted=request('/commit','',{}, {origin:'https://planly.example.test'});assert.equal((await libraryBatchCommit(accepted)).status,422);
  const rejectedHeaders:Record<string,string>[]=[{origin:'http://127.0.0.1:4219'},{origin:'https://planly.example.test',authorization:'Bearer fake'},{origin:'https://planly.example.test','x-planly-user-id':'forged'},{origin:'https://planly.example.test','sec-fetch-site':'same-site'}];
  for(const headers of rejectedHeaders){const response=await libraryBatchCommit(request('/commit','',{},headers));assert.equal(response.status,403);assert.equal((await response.json()).commitApplied,undefined);}
  process.env.PLANLY_PUBLIC_ORIGIN='http://planly.example.test';const unavailable=await libraryBatchCommit(request('/commit','',{}));assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).commitApplied,undefined);
 }finally{if(previous===undefined)delete process.env.PLANLY_PUBLIC_ORIGIN;else process.env.PLANLY_PUBLIC_ORIGIN=previous;}
});

test('real HTTP service preserves accepted receipt through invalid retries and projects only fresh slot rollback',async()=>{
 const url=new URL(process.env.DATABASE_URL!);assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/planly_test');
 const envNames=['TELEGRAM_BOT_TOKEN','MAX_BOT_TOKEN','TELEGRAM_MINI_APP_URL','MAX_MINI_APP_URL','PLANLY_PUBLIC_ORIGIN'];const previous=Object.fromEntries(envNames.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{TELEGRAM_BOT_TOKEN:'123456:synthetic_fixture_token_only_12345',MAX_BOT_TOKEN:'synthetic_fixture_token_only_12345',TELEGRAM_MINI_APP_URL:'https://t.me/fixture_bot',MAX_MINI_APP_URL:'https://max.ru/fixture_bot'});delete process.env.PLANLY_PUBLIC_ORIGIN;
 const db=getDb(),ids=['user','other','admin'].map(n=>`batch-http-${n}-${randomUUID()}`),raws=ids.map(()=>randomUUID()),sources=ids.map(()=>randomUUID());
 try{
  for(let i=0;i<ids.length;i++){await db.insert(users).values({id:ids[i],email:`${ids[i]}@example.test`,displayName:'HTTP fixture',role:i===2?'ADMIN':'USER',authInitialized:true,accessState:'ACTIVE',sessionVersion:1});await db.insert(sessions).values({id:randomUUID(),userId:ids[i],tokenHash:sessionTokenHash(raws[i]),sessionVersion:1,expiresAt:new Date('2031-01-01')});await db.insert(libraryItems).values({id:sources[i],userId:ids[i],bodyText:'Private native HTTP content',status:'READY'});const account=ids[i]+'-telegram',destination='-'+Date.now()+i;await db.insert(socialAccounts).values({id:account,userId:ids[i],provider:'TELEGRAM',providerAccountId:destination,displayName:'HTTP Telegram',enabled:true,connectionStatus:'CONNECTED',bindingRevision:1});await db.insert(socialBindings).values({accountId:account,userId:ids[i],provider:'TELEGRAM',destinationId:destination,humanId:'123',botId:'456',sessionVersion:1,revision:1,configRevision:socialConnectionConfig('TELEGRAM').revision,checkedAt:new Date()});}
  const input={sourceIds:[sources[0]],accountIds:[ids[0]+'-telegram'],settings};
  await body(await libraryBatchPreview(request('/preview','',input)),401);
  await body(await libraryBatchPreview(request('/preview')),401);assert.deepEqual(await body(await libraryBatchPreview(request('/preview',raws[0])),200),{eligible:true});assert.deepEqual(await body(await libraryBatchPreview(request('/preview',raws[2])),200),{eligible:false});
  await body(await libraryBatchPreview(request('/preview',raws[0],{...input,sourceIds:[sources[1]]})),404);await body(await libraryBatchPreview(request('/preview',raws[2],{...input,sourceIds:[sources[2]],accountIds:[ids[2]+'-telegram']})),403);
  const preview=await body(await libraryBatchPreview(request('/preview',raws[0],input)),200);assert.equal(preview.complete,true);assert.equal((await db.select().from(libraryBatchConsentOperations).where(eq(libraryBatchConsentOperations.userId,ids[0]))).length,0);
  const commit={operationId:randomUUID(),intent:preview.descriptor.intent,snapshotFingerprint:preview.descriptor.snapshotFingerprint,previewProof:preview.descriptor.previewProof};
  const occupant=await createPost(ids[0],{title:null,baseText:'Synthetic occupied slot',status:'READY',targets:[{provider:'telegram',textOverride:null,scheduledAt:commit.intent.rows[0].targets[0].scheduledAt}],mediaIds:[]});
  const rejected=await body(await libraryBatchCommit(request('/commit',raws[0],commit)),409);assert.equal(rejected.code,'BATCH_SLOT_CONFLICT');assert.equal(rejected.commitApplied,false);
  await updatePost(ids[0],occupant.id,{title:null,baseText:'Synthetic occupied slot',status:'DRAFT',targets:[{provider:'telegram',textOverride:null,scheduledAt:null}],mediaIds:[]});
  const saved=await body(await libraryBatchCommit(request('/commit',raws[0],commit)),200);assert.equal(saved.replayed,false);
  const invalidRequests=[request('/commit',raws[0],commit,{origin:'https://evil.example.test'}),request('/commit',raws[0],commit,{'x-planly-library-batch':'0'}),request('/commit',raws[0],'{'),request('/commit',raws[0],{...commit,extra:true}),request('/commit',raws[0],{...commit,userId:ids[1]}),request('/commit',raws[0],commit,{'sec-fetch-site':'cross-site'}),request('/commit?ownerId=x',raws[0],commit)];
  for(const invalid of invalidRequests){const response=await libraryBatchCommit(invalid);assert.ok([400,403,422].includes(response.status));assert.equal((await response.json()).commitApplied,undefined);}
  const huge=await body(await libraryBatchCommit(request('/commit',raws[0],JSON.stringify({padding:'x'.repeat(65536)}))),413);assert.equal(huge.commitApplied,undefined);
  const utf=new Request(origin+'/commit',{method:'POST',headers:{origin,'content-type':'application/json','x-planly-library-batch':'1'},body:new Uint8Array([0xff])});assert.equal((await body(await libraryBatchCommit(utf),400)).commitApplied,undefined);
  assert.equal((await body(await libraryBatchOperation(request('/result',raws[1]),{params:Promise.resolve({operationId:commit.operationId})}),404)).commitApplied,undefined);
  const recovered=await body(await libraryBatchOperation(request('/result',raws[0]),{params:Promise.resolve({operationId:commit.operationId})}),200);assert.deepEqual(recovered.receipt,saved.receipt);
  await db.update(users).set({role:'ADMIN'}).where(eq(users.id,ids[0]));assert.equal((await body(await libraryBatchCommit(request('/commit',raws[0],commit)),200)).replayed,true);
  const changed=structuredClone(commit);changed.intent.rows[0].targets[0].destinationId='-999';const conflict=await body(await libraryBatchCommit(request('/commit',raws[0],changed)),409);assert.equal(conflict.code,'BATCH_OPERATION_CONFLICT');assert.equal(conflict.commitApplied,undefined);
  await db.delete(posts).where(eq(posts.id,saved.receipt.rows[0].postId));const deleted=await body(await libraryBatchOperation(request('/result',raws[0]),{params:Promise.resolve({operationId:commit.operationId})}),410);assert.equal(deleted.commitApplied,undefined);assert.deepEqual(deleted.result,{operationId:commit.operationId,postIds:[saved.receipt.rows[0].postId]});
 }finally{
  // Include deleted-result publication IDs through the immutable receipt too.
  const receipts=await db.select().from(libraryBatchConsentOperations).where(inArray(libraryBatchConsentOperations.userId,ids));const jobs=new Set((await db.select().from(publications).where(inArray(publications.userId,ids))).map(p=>p.id));for(const row of receipts)for(const r of row.receipt.rows)for(const t of r.targets)jobs.add(t.publicationId);for(const id of jobs)await removePublicationJob(id);
  await db.delete(users).where(inArray(users.id,ids));await closePublicationQueue();await closeRedisConnection();await closeDb();for(const name of envNames){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}
 }
});
