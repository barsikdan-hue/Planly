import test, {after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {eq, like, sql} from 'drizzle-orm';
import {getDb, closeDb} from '../db/index.ts';
import * as s from '../db/schema.ts';
import {sessionTokenHash} from '../lib/server/auth/session.ts';
import {listPlannerPosts} from '../lib/server/posts.ts';
import {cancelPublicationApproval} from '../lib/server/publication-approval-cancellation.ts';
import {createSocialConnectionLifecycle} from '../lib/server/social-connections/lifecycle.ts';
import {POST} from '../app/api/posts/[id]/targets/[targetId]/cancel-approval/route.ts';
import {processPublication} from '../lib/server/scheduler/processor.ts';
import {prepareTemporaryPublicationRetry} from '../lib/server/scheduler/retry.ts';
import {Worker,type Job} from 'bullmq';
import {Client} from 'pg';
import {createHmac} from 'node:crypto';
import {getRedisConnection,closeRedisConnection} from '../lib/server/scheduler/redis.ts';
import {PUBLICATION_QUEUE_NAME,getPublicationQueue,ensurePublicationJob,closePublicationQueue} from '../lib/server/scheduler/queue.ts';
import {processPublicationJob} from '../lib/server/scheduler/worker.ts';
import {createSocialConnectionService} from '../lib/server/social-connections/service.ts';
import {createPost,updatePost} from '../lib/server/posts.ts';

const BASE = new Date('2026-10-17T10:00:00.000Z');
const input={expectedPublicationId:'r2-auth',expectedPublicationUpdatedAt:BASE.toISOString(),expectedTargetUpdatedAt:BASE.toISOString(),expectedBindingRevision:3};
const options={now:()=>BASE.getTime()+5000,mirrorQueue:async()=>{}};
const cancel=(raw='r2-synthetic-session',body=input)=>cancelPublicationApproval(raw,'r2-post','r2-target',body,options);
async function snapshot(){return {posts:await getDb().select().from(s.posts).where(eq(s.posts.id,'r2-post')),targets:await getDb().select().from(s.postTargets).where(eq(s.postTargets.postId,'r2-post')),history:await getDb().select().from(s.publications).where(eq(s.publications.postTargetId,'r2-target'))};}
const originalFetch=globalThis.fetch;
const originalOwner=process.env.OWNER_EMAIL;
globalThis.fetch=async()=>{throw new Error('Unexpected provider/network request');};
async function fixture(provider:'TELEGRAM'|'MAX'='TELEGRAM',code='PERSONAL_PROVIDER_SETUP_REQUIRED',count=0) {
 const db=getDb(),userId='r2-owner',raw='r2-synthetic-session';
 await db.insert(s.users).values({id:userId,email:'r2@example.test',displayName:'R2',authInitialized:true,accessState:'ACTIVE'});
 await db.insert(s.sessions).values({id:'r2-session',userId,tokenHash:sessionTokenHash(raw),sessionVersion:0,expiresAt:new Date('2099-01-01')});
 await db.insert(s.socialAccounts).values({id:'r2-account',userId,provider,displayName:'Current destination',bindingRevision:3,providerAccountId:'-999',enabled:false});
 await db.insert(s.posts).values({id:'r2-post',userId,baseText:'Private original',status:'READY',updatedAt:BASE});
 await db.insert(s.postTargets).values({id:'r2-target',postId:'r2-post',socialAccountId:'r2-account',textOverride:'Private override',scheduledAt:BASE,updatedAt:BASE});
 await db.insert(s.publications).values({id:'r2-auth',userId,postId:'r2-post',postTargetId:'r2-target',provider,status:'REQUIRES_RECONNECT',normalizedErrorType:'AUTH',providerErrorCode:code,providerErrorMessage:'Local guard',attemptCount:count,lastAttemptAt:count?BASE:null,scheduledAt:BASE,socialBindingRevision:1,socialBindingDestinationId:'-123',idempotencyKey:'r2-auth',updatedAt:BASE});
 return {raw,userId};
}
beforeEach(async()=>{process.env.OWNER_EMAIL=originalOwner;globalThis.fetch=async()=>{throw new Error('Unexpected provider/network request');};await getDb().delete(s.users).where(like(s.users.id,'r2-%'));});
after(async()=>{process.env.OWNER_EMAIL=originalOwner;globalThis.fetch=originalFetch;await getDb().delete(s.users).where(like(s.users.id,'r2-%'));await closePublicationQueue();await closeRedisConnection();await closeDb();});

for(const provider of ['TELEGRAM','MAX'] as const)for(const kind of ['personal','disconnected'])test(`${provider} ${kind} DTO exposes exact immutable AUTH and target preconditions`,async()=>{
 const a=await fixture(provider,kind==='personal'?'PERSONAL_PROVIDER_SETUP_REQUIRED':`${provider}_DISCONNECTED`,kind==='personal'?0:1);
 const [post]=await listPlannerPosts(a.userId);
 assert.deepEqual(post.targets[0].cancelApproval,{eligible:true,reason:'AVAILABLE',expectedPublicationId:'r2-auth',expectedPublicationUpdatedAt:BASE.toISOString(),expectedTargetUpdatedAt:BASE.toISOString(),expectedBindingRevision:3,historicalDestinationId:'-123'});
 assert.equal(post.targets[0].approvalCancelledAt,null);
});

const unsafe:Record<string,Partial<typeof s.publications.$inferInsert>>={
 'prior TEMPORARY retry then PERSONAL count1':{attemptCount:1,lastAttemptAt:BASE},
 'DISCONNECTED count2':{providerErrorCode:'TELEGRAM_DISCONNECTED',attemptCount:2,lastAttemptAt:BASE},
 'provider AUTH':{providerErrorCode:'TELEGRAM_401'},
 'unknown AUTH':{providerErrorCode:'UNKNOWN'},
 'ambiguous':{providerErrorCode:'AMBIGUOUS_DELIVERY'},
 'receipt':{providerRemoteId:'receipt'},
 'url receipt':{providerUrl:'https://example.test/receipt'},
 'published timestamp':{publishedAt:BASE},
 'analytics receipt destination':{analyticsDestinationId:'-123'},
 'negative count':{attemptCount:-1},
 'inconsistent timestamp':{lastAttemptAt:BASE},
 'wrong provider':{provider:'MAX'},
 'missing AUTH type':{normalizedErrorType:null},
};
for(const [name,change] of Object.entries(unsafe))test(`DTO blocks ${name}`,async()=>{
 const a=await fixture();await getDb().update(s.publications).set(change).where(eq(s.publications.id,'r2-auth'));
 const [post]=await listPlannerPosts(a.userId);assert.equal(post.targets[0].cancelApproval?.eligible,false);assert.equal(post.targets[0].cancelApproval?.reason,'UNSUPPORTED_HISTORY');
 const before=await snapshot();await assert.rejects(()=>cancel());assert.deepEqual(await snapshot(),before);
});
for(const status of ['FAILED','PUBLISHING','PUBLISHED','REQUIRES_RECONNECT','CANCELLED','SCHEDULED','QUEUED'] as const)test(`DTO blocks unsafe historical ${status}`,async()=>{
 const a=await fixture();await getDb().insert(s.publications).values({id:'r2-previous',userId:a.userId,postId:'r2-post',postTargetId:'r2-target',provider:'TELEGRAM',status,attemptCount:1,lastAttemptAt:BASE,idempotencyKey:'r2-previous'});
 const [post]=await listPlannerPosts(a.userId);assert.equal(post.targets[0].cancelApproval?.reason,'UNSUPPORTED_HISTORY');
 const before=await snapshot();await assert.rejects(()=>cancel());assert.deepEqual(await snapshot(),before);
});

for(const provider of ['TELEGRAM','MAX'] as const)for(const kind of ['personal','disconnected'])test(`native ${provider} ${kind} cancellation preserves original, replay survives release/rebind`,async()=>{
 const a=await fixture(provider,kind==='personal'?'PERSONAL_PROVIDER_SETUP_REQUIRED':`${provider}_DISCONNECTED`,kind==='personal'?0:1),before=await snapshot();
 const result=await cancel(a.raw);assert.deepEqual(result,{postId:'r2-post',targetId:'r2-target',publicationId:'r2-auth',approvalCancelledAt:'2026-10-17T10:00:05.000Z',replayed:false});
 const after=await snapshot();assert.deepEqual(after.posts,before.posts);assert.deepEqual(after.history,before.history);
 assert.deepEqual(after.targets,[{...before.targets[0],scheduledAt:null,approvalCancelledAt:new Date(result.approvalCancelledAt),updatedAt:new Date(result.approvalCancelledAt)}]);
 assert.deepEqual(await cancel(a.raw),{...result,replayed:true});
 await createSocialConnectionLifecycle({now:options.now}).release(a.raw,'r2-account',3);
 assert.deepEqual(await cancel(a.raw),{...result,replayed:true});
 await getDb().update(s.socialAccounts).set({bindingRevision:5,providerAccountId:'-555',enabled:true}).where(eq(s.socialAccounts.id,'r2-account'));
 assert.deepEqual(await cancel(a.raw),{...result,replayed:true});
 assert.deepEqual(await snapshot(),after);
 const [post]=await listPlannerPosts(a.userId);assert.equal(post.targets[0].cancelApproval?.reason,'ALREADY_CANCELLED');assert.equal(post.targets[0].cancelApproval?.historicalDestinationId,'-123');
});

test('release exception requires intact cancellation marker plus complete safe history',async()=>{
 const a=await fixture();await getDb().update(s.postTargets).set({scheduledAt:null,approvalCancelledAt:BASE,updatedAt:BASE}).where(eq(s.postTargets.id,'r2-target'));
 await createSocialConnectionLifecycle({now:options.now}).release(a.raw,'r2-account',3);
});

function req(body:unknown=input,headers:Record<string,string>={},query='') {
 return new Request('https://planly.test/api/posts/r2-post/targets/r2-target/cancel-approval'+query,{method:'POST',headers:{origin:'https://planly.test','content-type':'application/json','x-planly-social-connection':'1',cookie:'planly_session=r2-synthetic-session',...headers},body:JSON.stringify(body)});
}
const route=(request:Request)=>POST(request,{params:Promise.resolve({id:'r2-post',targetId:'r2-target'})});
test('HTTP authenticates, validates bounded strict origin JSON and preserves snapshots on rejection',async()=>{
 await fixture();const before=await snapshot();
 for(const [body,headers,query,status] of [
  [input,{cookie:''},'',401],[input,{origin:'https://other.test'},'',403],[input,{'x-planly-social-connection':''},'',403],
  [input,{'sec-fetch-site':'same-site'},'',403],[input,{'x-owner-id':'r2-owner'},'',403],[input,{authorization:'fake'},'',403],
  [input,{},'?userId=r2-owner',403],[{...input,actor:'r2-owner'},{},'',422],[{...input,expectedBindingRevision:'3'},{},'',422],
  [{...input,expectedPublicationUpdatedAt:'bad'},{},'',422],[{...input,expectedBindingRevision:2},{},'',409],
  [{...input,expectedTargetUpdatedAt:'2020-01-01T00:00:00Z'},{},'',409],
 ] as [unknown,Record<string,string>,string,number][]) {
  assert.equal((await route(req(body,headers,query))).status,status);assert.deepEqual(await snapshot(),before);
 }
 const malformed=new Request(req(),{body:'{'});assert.equal((await route(malformed)).status,400);
 assert.equal((await route(req({pad:'x'.repeat(5000)}))).status,413);
 const response=await route(req());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal((await response.json()).replayed,false);assert.equal((await (await route(req())).json()).replayed,true);
});

for(const selector of ['x-destination-id','x-planly-error-code'])test(`HTTP rejects ${selector} as a client provenance selector`,async()=>{
 await fixture();const before=await snapshot();assert.equal((await route(req(input,{[selector]:'untrusted'}))).status,403);assert.deepEqual(await snapshot(),before);
});

test('valid ACTIVE foreign session cannot mutate or replay owned cancellation',async()=>{
 await fixture();await getDb().insert(s.users).values({id:'r2-foreign',email:'r2-foreign@example.test',displayName:'Other',authInitialized:true,accessState:'ACTIVE'});
 await getDb().insert(s.sessions).values({id:'r2-other-session',userId:'r2-foreign',tokenHash:sessionTokenHash('foreign-session'),sessionVersion:0,expiresAt:new Date('2099-01-01')});
 let before=await snapshot();await assert.rejects(()=>cancel('foreign-session'));assert.deepEqual(await snapshot(),before);
 await cancel();before=await snapshot();await assert.rejects(()=>cancel('foreign-session'));assert.deepEqual(await snapshot(),before);
});

for(const change of ['target-version','date','publication-version','outcome','extra-auth','attempted-history','new-open'] as const)test(`replay rejects ${change} and never changes original`,async()=>{
 await fixture();await cancel();const db=getDb();
 if(change==='target-version')await db.update(s.postTargets).set({updatedAt:new Date(BASE.getTime()+9999)}).where(eq(s.postTargets.id,'r2-target'));
 if(change==='date')await db.update(s.postTargets).set({scheduledAt:BASE}).where(eq(s.postTargets.id,'r2-target'));
 if(change==='publication-version')await db.update(s.publications).set({updatedAt:new Date(BASE.getTime()+1)}).where(eq(s.publications.id,'r2-auth'));
 if(change==='outcome')await db.update(s.publications).set({providerErrorCode:'TELEGRAM_401'}).where(eq(s.publications.id,'r2-auth'));
 if(change==='extra-auth'||change==='attempted-history')await db.insert(s.publications).values({id:'r2-later',userId:'r2-owner',postId:'r2-post',postTargetId:'r2-target',provider:'TELEGRAM',status:change==='extra-auth'?'REQUIRES_RECONNECT':'CANCELLED',attemptCount:1,lastAttemptAt:BASE,idempotencyKey:'r2-later'});
 if(change==='new-open')await openSibling();
 const before=await snapshot();await assert.rejects(()=>cancel());assert.deepEqual(await snapshot(),before);
 // Release checks present safety, not a client-supplied historical version.
 if(change!=='publication-version')await assert.rejects(()=>createSocialConnectionLifecycle({now:options.now}).release('r2-synthetic-session','r2-account',3));
});

for(const relation of ['user','post','provider'] as const)test(`inconsistent ${relation} history fails closed without disclosing AUTH identity`,async()=>{
 await fixture();await getDb().insert(s.users).values({id:'r2-foreign',email:'r2-foreign@example.test',displayName:'Other'});
 await getDb().insert(s.posts).values({id:'r2-foreign-post',userId:'r2-foreign',baseText:'Other'});
 await getDb().update(s.publications).set(relation==='user'?{userId:'r2-foreign'}:relation==='post'?{postId:'r2-foreign-post'}:{provider:'MAX'}).where(eq(s.publications.id,'r2-auth'));
 const before=await snapshot();await assert.rejects(()=>cancel());assert.deepEqual(await snapshot(),before);
 const [post]=await listPlannerPosts('r2-owner');assert.equal(post.targets[0].cancelApproval?.eligible,false);assert.equal(post.targets[0].cancelApproval?.expectedPublicationId,null);assert.equal(post.targets[0].publication,null);
});

for(const phase of ['before','replay'])for(const state of ['BLOCKED','expired','revoked','foreign'] as const)test(`${phase} rejects ${state} actor`,async()=>{
 await fixture();if(phase==='replay')await cancel();
 if(state==='BLOCKED')await getDb().update(s.users).set({accessState:'BLOCKED'}).where(eq(s.users.id,'r2-owner'));
 if(state==='expired')await getDb().update(s.sessions).set({expiresAt:new Date('2000-01-01')}).where(eq(s.sessions.id,'r2-session'));
 if(state==='revoked')await getDb().delete(s.sessions).where(eq(s.sessions.id,'r2-session'));
 const before=await snapshot();await assert.rejects(()=>cancel(state==='foreign'?'other-session':'r2-synthetic-session'));assert.deepEqual(await snapshot(),before);
});

test('safe open siblings cancel atomically despite queue cleanup failure; missing historical destination stays unknown',async()=>{
 await fixture();await getDb().update(s.publications).set({socialBindingDestinationId:null}).where(eq(s.publications.id,'r2-auth'));
 for(const status of ['SCHEDULED','QUEUED','CANCELLED'] as const)await getDb().insert(s.publications).values({id:'r2-'+status,userId:'r2-owner',postId:'r2-post',postTargetId:'r2-target',provider:'TELEGRAM',status,nextRetryAt:BASE,idempotencyKey:'r2-'+status});
 let removed:string[]=[];
 await cancelPublicationApproval('r2-synthetic-session','r2-post','r2-target',input,{...options,mirrorQueue:async changes=>{removed=changes.map(row=>row.publicationId);throw new Error('Active job cannot be removed');}});
 assert.deepEqual(removed.sort(),['r2-QUEUED','r2-SCHEDULED']);
 for(const row of (await snapshot()).history.filter(row=>removed.includes(row.id))){assert.equal(row.status,'CANCELLED');assert.equal(row.nextRetryAt,null);assert.equal(row.attemptCount,0);}
 const [post]=await listPlannerPosts('r2-owner');assert.equal(post.targets[0].cancelApproval?.historicalDestinationId,null);
});

async function openSibling(status:'SCHEDULED'|'QUEUED'|'FAILED'='QUEUED') {
 await getDb().insert(s.publications).values({id:'r2-open',userId:'r2-owner',postId:'r2-post',postTargetId:'r2-target',provider:'TELEGRAM',status,scheduledAt:BASE,idempotencyKey:'r2-open',...(status==='FAILED'?{attemptCount:1,lastAttemptAt:BASE,normalizedErrorType:'TEMPORARY' as const,providerErrorCode:'TELEGRAM_429'}:{})});
}
async function blockedRace(lock:'user'|'publication',first:()=>Promise<unknown>,second:()=>Promise<unknown>) {
 let release!:()=>void,ready!:(pid:number)=>void;
 const held=new Promise<void>(r=>release=r),started=new Promise<number>(r=>ready=r);
 const gate=getDb().transaction(async tx=>{
  if(lock==='user')await tx.select().from(s.users).where(eq(s.users.id,'r2-owner')).for('update');
  else await tx.select().from(s.publications).where(eq(s.publications.id,'r2-open')).for('update');
  const result=await tx.execute<{pid:number}>(sql`select pg_backend_pid() as pid`);ready(result.rows[0].pid);await held;
 });
 const pid=await started,tasks:Promise<unknown>[]=[];
 const wait=async(count:number)=>{
  const until=performance.now()+5000;
  while(performance.now()<until){
   const r=await getDb().execute<{count:string}>(sql`with recursive blocked(pid) as (select pid from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid)) union select a.pid from pg_stat_activity a join blocked b on b.pid=any(pg_blocking_pids(a.pid))) select count(*) from blocked`);
   if(Number(r.rows[0].count)>=count)return;
  }assert.fail(`Missing ${count} native PostgreSQL lock contenders`);
 };
 try {tasks.push(first());await wait(1);tasks.push(second());await wait(2);release();await gate;return await Promise.all(tasks);}
 finally{release();await Promise.allSettled([gate,...tasks]);}
}

for(const winner of ['cancel','processor'])test(`synthetic open sibling defense: ${winner} wins real native claim ordering`,async()=>{
 await fixture();await openSibling();process.env.OWNER_EMAIL='r2@example.test';process.env.TELEGRAM_BOT_TOKEN='123456:SYNTHETIC_ONLY_NEVER_REAL_SECRET';
 await getDb().update(s.socialAccounts).set({enabled:true,connectionStatus:'CONNECTED'}).where(eq(s.socialAccounts.id,'r2-account'));
 let sends=0;
 globalThis.fetch=async(url,init)=>{assert.equal(new URL(String(url)).hostname,'api.telegram.org');assert.ok(String(url).endsWith('/sendMessage'));const body=JSON.parse(String(init?.body));assert.equal(body.chat_id,'-999');sends++;return Response.json({ok:true,result:{message_id:72,chat:{id:-999,type:'channel'}}});};
 const before=(await snapshot()).history.find(row=>row.id==='r2-auth');
 const cancellation=()=>cancel().then(value=>({value}),error=>({error}));
 const processor=()=>processPublication('r2-open');
 const results=await blockedRace('publication',winner==='cancel'?cancellation:processor,winner==='cancel'?processor:cancellation);
 const history=(await snapshot()).history;assert.deepEqual(history.find(row=>row.id==='r2-auth'),before);
 if(winner==='cancel'){
  assert.equal(history.find(row=>row.id==='r2-open')?.status,'CANCELLED');assert.equal(sends,0);assert.equal('value' in (results[0] as object),true);
  await createSocialConnectionLifecycle({now:options.now}).release('r2-synthetic-session','r2-account',3);
  await getDb().update(s.socialAccounts).set({bindingRevision:5,providerAccountId:'-777',enabled:true}).where(eq(s.socialAccounts.id,'r2-account'));
  await processPublication('r2-open');await processPublication('r2-auth');assert.equal(sends,0);
 }else{
  assert.equal(history.find(row=>row.id==='r2-open')?.providerErrorCode,null,'registered connector must reach the controlled fake provider');
  assert.equal('error' in (results[1] as object),true);assert.equal(history.find(row=>row.id==='r2-open')?.status,'PUBLISHED');assert.equal(history.find(row=>row.id==='r2-open')?.providerRemoteId,'72');assert.equal(sends,1);
  assert.equal((await snapshot()).targets[0].approvalCancelledAt,null);
 }
});

for(const winner of ['cancel','release'])test(`native owner serialization: ${winner} runs first`,async()=>{
 await fixture();const release=()=>createSocialConnectionLifecycle({now:options.now}).release('r2-synthetic-session','r2-account',3).then(value=>({value}),error=>({error}));
 const results=await blockedRace('user',winner==='cancel'?()=>cancel():release,winner==='cancel'?release:()=>cancel());
 if(winner==='cancel')assert.equal('value' in (results[1] as object),true);else assert.equal('error' in (results[0] as object),true);
 assert.ok((await snapshot()).targets[0].approvalCancelledAt);
});

test('actual AUTH retry veto and prior retry then local AUTH remain ineligible',async()=>{
 await fixture();await openSibling('FAILED');const before=await snapshot();
 assert.deepEqual(await prepareTemporaryPublicationRetry('r2-open',5,[1]),{scheduled:false});assert.deepEqual(await snapshot(),before);
 await assert.rejects(()=>cancel());
 await getDb().delete(s.publications).where(eq(s.publications.id,'r2-auth'));
 assert.equal((await prepareTemporaryPublicationRetry('r2-open',5,[1])).scheduled,true);
 assert.equal((await processPublication('r2-open')).status,'REQUIRES_RECONNECT');
 const row=(await snapshot()).history[0];assert.equal(row.providerErrorCode,'PERSONAL_PROVIDER_SETUP_REQUIRED');assert.equal(row.attemptCount,1);
 const [post]=await listPlannerPosts('r2-owner');assert.equal(post.targets[0].cancelApproval?.eligible,false);
 await assert.rejects(()=>cancel('r2-synthetic-session',{...input,expectedPublicationId:'r2-open',expectedPublicationUpdatedAt:row.updatedAt.toISOString()}));
});

for(const provider of ['TELEGRAM','MAX'] as const)for(const mode of ['personal','disconnected'])test(`default registered ${provider} ${mode} creates supported AUTH without network`,async()=>{
 await fixture(provider);await getDb().update(s.publications).set({status:'QUEUED',normalizedErrorType:null,providerErrorCode:null,providerErrorMessage:null}).where(eq(s.publications.id,'r2-auth'));
 if(mode==='disconnected'){process.env.OWNER_EMAIL='r2@example.test';process.env[`${provider}_BOT_TOKEN`]='123456:SYNTHETIC_ONLY_NEVER_REAL_SECRET';}
 assert.equal((await processPublication('r2-auth')).status,'REQUIRES_RECONNECT');
 const row=(await snapshot()).history[0];assert.equal(row.attemptCount,mode==='personal'?0:1);assert.equal(row.providerErrorCode,mode==='personal'?'PERSONAL_PROVIDER_SETUP_REQUIRED':`${provider}_DISCONNECTED`);
 await cancel('r2-synthetic-session',{...input,expectedPublicationUpdatedAt:row.updatedAt.toISOString()});
});

test('native transaction rollback preserves marker schedule and AUTH when sibling write fails',async context=>{
 await fixture();await openSibling();const before=await snapshot(),query=Client.prototype.query;let injected=0;
 context.mock.method(Client.prototype,'query',function(this:Client,...args:unknown[]){
  const config=args[0],statement=typeof config==='string'?config:config && typeof config==='object' && 'text' in config?config.text:undefined;
  if(typeof statement==='string' && statement.startsWith('update "publications"')){injected++;return Promise.reject(new Error('Synthetic statement failure'));}
  return Reflect.apply(query,this,args);
 } as Client['query']);
 await assert.rejects(()=>cancel());assert.equal(injected,1);assert.deepEqual(await snapshot(),before);
});

test('actual BullMQ active job cannot be removed; committed DB cancellation fences resumed worker and completion',async()=>{
 await fixture();await openSibling();const queue=getPublicationQueue();await queue.obliterate({force:true});
 let release!:()=>void,enter!:(job:Job)=>void,complete!:()=>void;
 const gate=new Promise<void>(r=>release=r),entered=new Promise<Job>(r=>enter=r),completed=new Promise<void>(r=>complete=r);
 const worker=new Worker(PUBLICATION_QUEUE_NAME,async job=>{enter(job);await gate;await processPublicationJob(job);},{connection:getRedisConnection()});
 worker.on('completed',()=>complete());
 try {
  await ensurePublicationJob('r2-open',new Date(0));const job=await entered;
  assert.equal(await job.getState(),'active');await assert.rejects(()=>job.remove(),/locked|lock/i);
  await cancelPublicationApproval('r2-synthetic-session','r2-post','r2-target',input,{now:options.now});
  assert.equal(await job.getState(),'active');assert.equal((await snapshot()).history.find(row=>row.id==='r2-open')?.status,'CANCELLED');
  release();await completed;assert.equal(await queue.getJob('r2-open'),undefined);
  const authCompleted=new Promise<void>((resolve,reject)=>{worker.once('completed',()=>resolve());worker.once('failed',(_job,error)=>reject(error));});
  await ensurePublicationJob('r2-auth',new Date(0));await authCompleted;
  assert.equal((await snapshot()).history.find(row=>row.id==='r2-auth')?.status,'REQUIRES_RECONNECT');
 }finally{release();await worker.close();await queue.obliterate({force:true});}
});

test('verified USER cancel release rebind copy draft then fresh approval gets new identities/current pointer',async()=>{
 const a=await fixture(),original=await snapshot();await cancel();await createSocialConnectionLifecycle({now:options.now}).release(a.raw,'r2-account',3);
 const token='123456:SYNTHETIC_ONLY_NEVER_REAL_SECRET';process.env.TELEGRAM_BOT_TOKEN=token;process.env.TELEGRAM_MINI_APP_URL='https://t.me/fixture_bot';
 let sends=0;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.hostname,'api.telegram.org');const body=JSON.parse(String(init?.body??'{}'));
  if(url.pathname.endsWith('/getMe'))return Response.json({ok:true,result:{id:123456,is_bot:true}});
  if(url.pathname.endsWith('/getChat'))return Response.json({ok:true,result:{id:-777,type:'channel',title:'New destination'}});
  if(url.pathname.endsWith('/getChatMember'))return Response.json({ok:true,result:{user:{id:body.user_id,is_bot:body.user_id===123456},status:'administrator',can_post_messages:true}});
  if(url.pathname.endsWith('/sendMessage')){sends++;assert.equal(body.chat_id,'-777');return Response.json({ok:true,result:{message_id:81,chat:{id:-777,type:'channel'}}});}
  throw new Error('Unexpected registered USER provider operation');
 };
 const service=createSocialConnectionService({now:options.now}),start=await service.start(a.raw,'r2-account','-777');
 const data={auth_date:String(Math.floor(options.now()/1000)),start_param:new URL(start.launchUrl).searchParams.get('startapp')!,user:JSON.stringify({id:42,is_bot:false,first_name:'Synthetic'})};
 const canonical=Object.entries(data).sort(([left],[right])=>left<right?-1:1).map(([key,value])=>`${key}=${value}`).join('\n');
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 const proof=new URLSearchParams({...data,hash:createHmac('sha256',secret).update(canonical).digest('hex')}).toString();
 const received=await service.receive('TELEGRAM',proof);await service.confirm(a.raw,received.ticket);
 await createSocialConnectionLifecycle({now:options.now}).enable(a.raw,'r2-account',5);
 const draftInput={baseText:'Private original',status:'DRAFT' as const,mediaIds:[],targets:[{provider:'telegram' as const,textOverride:'Private override',scheduledAt:null}]};
 await assert.rejects(()=>updatePost(a.userId,'r2-post',draftInput,options));
 const copy=await createPost(a.userId,draftInput,options);assert.notEqual(copy.id,'r2-post');assert.notEqual(copy.targets[0].id,'r2-target');assert.equal(copy.targets[0].publication,null);assert.equal(sends,0);
 const approved=await updatePost(a.userId,copy.id,{...draftInput,status:'READY',targets:[{...draftInput.targets[0],scheduledAt:new Date(options.now()+86400000).toISOString()}]},options);
 const [newPublication]=await getDb().select().from(s.publications).where(eq(s.publications.postId,approved.id));assert.notEqual(newPublication.id,'r2-auth');assert.equal(newPublication.socialBindingRevision,5);assert.equal(newPublication.socialBindingDestinationId,'-777');assert.equal(sends,0);
 await processPublication('r2-auth');assert.equal(sends,0);assert.equal((await processPublication(newPublication.id)).status,'PUBLISHED');assert.equal(sends,1);
 const old=await snapshot();assert.deepEqual(old.posts,original.posts);assert.deepEqual(old.history,original.history);
});

for(const outcome of ['receipt','ambiguous'])test(`actual admitted PUBLISHING request rejects cancellation and preserves later ${outcome}`,async()=>{
 await fixture();await openSibling();process.env.OWNER_EMAIL='r2@example.test';process.env.TELEGRAM_BOT_TOKEN='123456:SYNTHETIC_ONLY_NEVER_REAL_SECRET';
 await getDb().update(s.socialAccounts).set({enabled:true,connectionStatus:'CONNECTED'}).where(eq(s.socialAccounts.id,'r2-account'));
 let enter!:()=>void,release!:()=>void;const started=new Promise<void>(r=>enter=r),held=new Promise<void>(r=>release=r);
 globalThis.fetch=async url=>{assert.equal(new URL(String(url)).hostname,'api.telegram.org');assert.ok(String(url).endsWith('/sendMessage'));enter();await held;if(outcome==='ambiguous')throw new Error('Synthetic uncertain transport');return Response.json({ok:true,result:{message_id:91,chat:{id:-999,type:'channel'}}});};
 const work=processPublication('r2-open');
 try {
  await started;const before=await snapshot();assert.equal(before.history.find(row=>row.id==='r2-open')?.status,'PUBLISHING');
  await assert.rejects(()=>cancel());assert.deepEqual(await snapshot(),before);
 }finally{release();await work;}
 const after=await snapshot(),row=after.history.find(row=>row.id==='r2-open')!;
 assert.equal(row.status,outcome==='receipt'?'PUBLISHED':'FAILED');assert.equal(row.providerRemoteId,outcome==='receipt'?'91':null);assert.equal(row.providerErrorCode,outcome==='receipt'?null:'AMBIGUOUS_DELIVERY');assert.equal(after.targets[0].approvalCancelledAt,null);
 await assert.rejects(()=>cancel());assert.deepEqual(await snapshot(),after);
});

test('published sibling target receipt remains intact while selected AUTH is cancelled',async()=>{
 await fixture();await getDb().insert(s.socialAccounts).values({id:'r2-max',userId:'r2-owner',provider:'MAX',displayName:'Published sibling'});
 await getDb().insert(s.postTargets).values({id:'r2-max-target',postId:'r2-post',socialAccountId:'r2-max',scheduledAt:BASE});
 await getDb().insert(s.publications).values({id:'r2-max-publication',userId:'r2-owner',postId:'r2-post',postTargetId:'r2-max-target',provider:'MAX',status:'PUBLISHED',providerRemoteId:'retained-receipt',publishedAt:BASE,attemptCount:1,lastAttemptAt:BASE,idempotencyKey:'r2-max-publication'});
 const before=await getDb().select().from(s.publications).where(eq(s.publications.id,'r2-max-publication'));await cancel();assert.deepEqual(await getDb().select().from(s.publications).where(eq(s.publications.id,'r2-max-publication')),before);
});

for(const phase of ['first','replay'])test(`${phase} rejects wrong immutable AUTH ID and stale publication timestamp`,async()=>{
 await fixture();if(phase==='replay')await cancel();const before=await snapshot();
 for(const body of [{...input,expectedPublicationId:'different'},{...input,expectedPublicationUpdatedAt:'2020-01-01T00:00:00Z'}])await assert.rejects(()=>cancel('r2-synthetic-session',body));
 assert.deepEqual(await snapshot(),before);
});
