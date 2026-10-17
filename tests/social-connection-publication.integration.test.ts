import { createPost } from '../lib/server/posts.ts';
import { Client } from 'pg';
import { reconcilePostPublications } from '../lib/server/publications.ts';
import { processPublication } from '../lib/server/scheduler/processor.ts';
import { setUserAccessState } from '../lib/server/auth/access.ts';
import { apiError } from '../lib/server/http.ts';
import { createSocialConnectionLifecycle } from '../lib/server/social-connections/lifecycle.ts';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import { getDb, getPool, closeDb } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { ensureOwnerSocialAccounts } from '../lib/server/social-accounts.ts';
import { sessionTokenHash } from '../lib/server/auth/session.ts';
import { createSocialConnectionService } from '../lib/server/social-connections/service.ts';

const originalFetch=globalThis.fetch;
const TOKEN='123456:TEST_only_never_real_secret', BASE=Date.now();
let now=BASE, requests=0, failHuman=false, failBot=false, unavailable=false, wrongDestination=false;
let starts=0,sentDestination:string|null=null,authError=false,sendError=false;
let sendHold:(()=>Promise<void>)|undefined;
let hold: (()=>Promise<void>)|undefined;
const fetcher:typeof fetch=async (input,init)=>{
  requests++; if(hold) await hold();
  if(unavailable) return Response.json({ok:false,error_code:503},{status:503});
  const url=new URL(String(input));
  if(url.hostname==='platform-api2.max.ru') {
    if(url.pathname==='/messages'){starts++;sentDestination=url.searchParams.get('chat_id');if(sendHold)await sendHold();if(sendError)throw new Error('uncertain');if(authError)return Response.json({code:'access.denied',message:'denied'},{status:403});return Response.json({message:{body:{mid:'fixture-max-id'},recipient:{chat_id:Number(sentDestination),chat_type:'channel'}}});}
    if(url.pathname==='/me') return Response.json({user_id:7,is_bot:true});
    if(url.pathname.endsWith('/members/me')) return Response.json({user_id:7,is_bot:true,is_owner:false,is_admin:!failBot,permissions:['write']});
    if(url.pathname.endsWith('/members')) return Response.json({members:[{user_id:42,is_bot:false,is_owner:false,is_admin:!failHuman,permissions:['write']}]});
    return Response.json({chat_id:Number(url.pathname.split('/')[2]),type:'channel',status:'active',title:'Fixture D'});
  }
  if(url.hostname!=='api.telegram.org')throw new Error('Unexpected host');
  const body=JSON.parse(String(init?.body??'{}'));
  if(url.pathname.endsWith('/sendMessage')){starts++;sentDestination=body.chat_id;if(sendHold)await sendHold();if(sendError)throw new Error('uncertain');if(authError)return Response.json({ok:false,error_code:403,description:'Forbidden'},{status:403});return Response.json({ok:true,result:{message_id:9,chat:{id:Number(body.chat_id),type:'channel'}}});}
  if(url.pathname.endsWith('/getMe')) return Response.json({ok:true,result:{id:123456,is_bot:true}});
  if(url.pathname.endsWith('/getChat')) return Response.json({ok:true,result:{id:wrongDestination?-888:Number(body.chat_id?.startsWith('@')?'-12345':body.chat_id),type:'channel',title:'Fixture D'}});
  if(url.pathname.endsWith('/getChatMember')) {
    const bot=body.user_id===123456;
    return Response.json({ok:true,result:{user:{id:body.user_id,is_bot:bot},status:(bot?failBot:failHuman)?'member':'administrator',can_post_messages:true}});
  }
  throw new Error('Unexpected fake transport operation');
};
function signed(launchUrl:string,human=42,auth=now,provider='TELEGRAM') {
 const data={auth_date:String(Math.floor(auth/1000)),start_param:new URL(launchUrl).searchParams.get('startapp')!,user:JSON.stringify({id:human,is_bot:false,first_name:'Ada'})};
 const canonical=Object.entries(data).sort(([a],[b])=>a<b?-1:1).map(([k,v])=>`${k}=${v}`).join('\n');
 const key=createHmac('sha256','WebAppData').update(provider==='MAX'?'MAX_TEST_ONLY_secret':TOKEN).digest();
 return new URLSearchParams({...data,hash:createHmac('sha256',key).update(canonical).digest('hex')}).toString();
}
async function service() {
  return createSocialConnectionService({now:()=>now,fetcher});
}
async function actor(name:string,provider:'TELEGRAM'|'MAX'|'VK'='TELEGRAM') {
 const db=getDb(),id=`e4p-${name}`,raw=`synthetic-session-${name}-${randomUUID()}`;
 await db.insert(schema.users).values({id,email:`${id}@example.test`,displayName:`Person ${name}`,authInitialized:true,accessState:'ACTIVE'});
 await db.insert(schema.sessions).values({id:randomUUID(),userId:id,tokenHash:sessionTokenHash(raw),sessionVersion:0,expiresAt:new Date(BASE+86400000)});
 await ensureOwnerSocialAccounts(id);
 const accounts=await db.select().from(schema.socialAccounts).where(eq(schema.socialAccounts.userId,id));
 return {id,raw,account:accounts.find(a=>a.provider===provider)!};
}
async function ticket(s:Awaited<ReturnType<typeof service>>,a:Awaited<ReturnType<typeof actor>>,destination='-12345',human=42) {
 const start=await s.start(a.raw,a.account.id,destination),proof=signed(start.launchUrl,human,now,a.account.provider);
 return {start,proof,received:await s.receive(a.account.provider as 'TELEGRAM'|'MAX',proof)};
}
async function row(id:string){return (await getDb().select().from(schema.socialAccounts).where(eq(schema.socialAccounts.id,id)))[0];}
beforeEach(async()=>{
 await getDb().delete(schema.users).where(like(schema.users.id,'e4p-%'));
 await getDb().delete(schema.socialProofRateLimits);
 globalThis.fetch=fetcher;starts=0;sentDestination=null;authError=false;sendError=false;sendHold=undefined;now=BASE;requests=0;failHuman=false;failBot=false;unavailable=false;wrongDestination=false;hold=undefined;
 process.env.TELEGRAM_BOT_TOKEN=TOKEN;process.env.TELEGRAM_MINI_APP_URL='https://t.me/test_bot';
 process.env.MAX_BOT_TOKEN='MAX_TEST_ONLY_secret';process.env.MAX_MINI_APP_URL='https://max.ru/test_bot';
});
after(async()=>{globalThis.fetch=originalFetch;await getDb().delete(schema.users).where(like(schema.users.id,'e4p-%'));await getDb().delete(schema.socialProofRateLimits);await closeDb();});

async function lifecycle() {
 return createSocialConnectionLifecycle({now:()=>now,fetcher});
}
async function verified(provider:'TELEGRAM'|'MAX'='TELEGRAM') {
 const s=await service(),a=await actor('lifecycle',provider),t=await ticket(s,a,provider==='MAX'?'-66666':'-12345');
 await s.confirm(a.raw,t.received.ticket);return {s,a};
}

async function work(a:Awaited<ReturnType<typeof actor>>,admit=true) {
 await getDb().insert(schema.posts).values({id:'e4p-post',userId:a.id,baseText:'private',status:'READY'});
 await getDb().insert(schema.postTargets).values({id:'e4p-target',postId:'e4p-post',socialAccountId:a.account.id,active:true,scheduledAt:new Date(BASE+999999)});
 if(admit)await reconcilePostPublications(a.id,'e4p-post');
 return (await getDb().select().from(schema.publications).where(eq(schema.publications.postId,'e4p-post')))[0];
}
async function ready(provider:'TELEGRAM'|'MAX'='TELEGRAM') {const v=await verified(provider),l=await lifecycle();await l.enable(v.a.raw,v.a.account.id,1);return {...v,l};}
for(const provider of ['TELEGRAM','MAX'] as const)test(`${provider} real registered USER admission freezes pointer and publishes confirmed receipt`,async()=>{
 const {a}=await ready(provider),p=await work(a);assert.equal(p.socialBindingRevision,1);assert.equal(p.socialBindingDestinationId,provider==='MAX'?'-66666':'-12345');
 const result=await processPublication(p.id);assert.equal(result.status,'PUBLISHED');assert.equal(starts,1);assert.equal(sentDestination,p.socialBindingDestinationId);
 const [saved]=await getDb().select().from(schema.publications).where(eq(schema.publications.id,p.id));assert.ok(saved.providerRemoteId);assert.equal(saved.analyticsDestinationId,p.socialBindingDestinationId);
 await processPublication(p.id);assert.equal(starts,1);
});
for(const fault of ['proof','disabled','epoch','config'] as const)test(`new USER admission denies ${fault} with known safe error`,async()=>{
 const {a}=await ready();await work(a,false);
 if(fault==='proof')await getDb().delete(schema.socialBindings).where(eq(schema.socialBindings.accountId,a.account.id));
 if(fault==='disabled')await getDb().update(schema.socialAccounts).set({enabled:false}).where(eq(schema.socialAccounts.id,a.account.id));
 if(fault==='epoch')await getDb().update(schema.users).set({sessionVersion:1}).where(eq(schema.users.id,a.id));
 if(fault==='config')process.env.TELEGRAM_MINI_APP_URL='https://t.me/changed_bot';
 await assert.rejects(()=>reconcilePostPublications(a.id,'e4p-post'),(error:unknown)=>apiError(error).status===403);
 assert.equal((await getDb().select().from(schema.publications).where(eq(schema.publications.postId,'e4p-post'))).length,0);
});
for(const fault of ['proof','account','destination','config','epoch','revision','disabled','principal'] as const)test(`registered USER ${fault} rejected before claim and provider reads`,async()=>{
 const {a}=await ready(),p=await work(a);
 if(fault==='proof')await getDb().delete(schema.socialBindings).where(eq(schema.socialBindings.accountId,a.account.id));
 if(fault==='account')await getDb().update(schema.socialBindings).set({userId:(await actor('foreign')).id}).where(eq(schema.socialBindings.accountId,a.account.id));
 if(fault==='destination')await getDb().update(schema.socialAccounts).set({providerAccountId:'-999'}).where(eq(schema.socialAccounts.id,a.account.id));
 if(fault==='config')process.env.TELEGRAM_MINI_APP_URL='https://t.me/changed_bot';
 if(fault==='epoch')await getDb().update(schema.users).set({sessionVersion:1}).where(eq(schema.users.id,a.id));
 if(fault==='revision')await getDb().update(schema.publications).set({socialBindingRevision:0}).where(eq(schema.publications.id,p.id));
 if(fault==='disabled')await getDb().update(schema.socialAccounts).set({enabled:false}).where(eq(schema.socialAccounts.id,a.account.id));
 if(fault==='principal')await getDb().update(schema.users).set({authInitialized:false}).where(eq(schema.users.id,a.id));
 const calls=requests;assert.equal((await processPublication(p.id)).status,'REQUIRES_RECONNECT');assert.equal(requests,calls);assert.equal(starts,0);
 assert.equal((await getDb().select().from(schema.publications).where(eq(schema.publications.id,p.id)))[0].attemptCount,0);
});
test('reschedule preserves old immutable pointer and cannot silently gain new proof revision',async()=>{
 const {s,a}=await ready(),p=await work(a);const t=await ticket(s,a);await s.confirm(a.raw,t.received.ticket);await (await lifecycle()).enable(a.raw,a.account.id,2);
 await getDb().update(schema.postTargets).set({scheduledAt:new Date(BASE+9999999)}).where(eq(schema.postTargets.id,'e4p-target'));
 await reconcilePostPublications(a.id,'e4p-post');const [saved]=await getDb().select().from(schema.publications).where(eq(schema.publications.id,p.id));
 assert.equal(saved.socialBindingRevision,1);assert.equal(saved.socialBindingDestinationId,'-12345');assert.equal((await processPublication(p.id)).status,'REQUIRES_RECONNECT');assert.equal(starts,0);
});
for(const race of ['pause','block-restore','config','reproof','destination'] as const)test(`final USER control race ${race} starts no send`,async()=>{
 const {s,a,l}=await ready(),p=await work(a);let enter!:()=>void,release!:()=>void;
 const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);let once=true;hold=async()=>{if(once){once=false;enter();await gate;}};
 const job=processPublication(p.id);assert.equal(await Promise.race([entered.then(()=>true),job.then(()=>false)]),true,'registered USER must reach controlled handoff seam');
 if(race==='pause')await l.pause(a.raw,a.account.id,1);
 if(race==='block-restore'){await setUserAccessState(a.id,'BLOCKED');await setUserAccessState(a.id,'ACTIVE');}
 if(race==='config')process.env.TELEGRAM_MINI_APP_URL='https://t.me/changed_bot';
 if(race==='reproof'){const t=await ticket(s,a);await s.confirm(a.raw,t.received.ticket);}
 if(race==='destination')await getDb().update(schema.socialAccounts).set({providerAccountId:'-999'}).where(eq(schema.socialAccounts.id,a.account.id));
 release();assert.equal((await job).status,'REQUIRES_RECONNECT');assert.equal(starts,0);
});
for(const outcome of ['receipt','ambiguous','auth','auth-generation'] as const)test(`admitted old ${outcome} survives lifecycle change with no duplicate send`,async()=>{
 const {s,a,l}=await ready(),p=await work(a);let enter!:()=>void,release!:()=>void;
 const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);sendHold=async()=>{enter();await gate;};
 const job=processPublication(p.id);assert.equal(await Promise.race([entered.then(()=>true),job.then(()=>false)]),true,'registered USER must reach controlled handoff seam');
 await l.pause(a.raw,a.account.id,1);
 if(outcome==='auth'){const t=await ticket(s,a);await s.confirm(a.raw,t.received.ticket);await l.enable(a.raw,a.account.id,2);authError=true;}
 if(outcome==='auth-generation'){await l.enable(a.raw,a.account.id,1);authError=true;}
 if(outcome==='ambiguous')sendError=true;
 release();const result=await job;assert.equal(result.status,outcome==='receipt'?'PUBLISHED':outcome.startsWith('auth')?'REQUIRES_RECONNECT':'FAILED');
 const [saved]=await getDb().select().from(schema.publications).where(eq(schema.publications.id,p.id));
 if(outcome==='receipt')assert.equal(saved.providerRemoteId,'9');if(outcome==='ambiguous')assert.equal(saved.providerErrorCode,'AMBIGUOUS_DELIVERY');
 if(outcome.startsWith('auth')){assert.equal((await row(a.account.id)).connectionStatus,'CONNECTED');assert.equal((await row(a.account.id)).enabled,true);assert.equal((await row(a.account.id)).bindingRevision,outcome==='auth'?2:1);}
 await processPublication(p.id);assert.equal(starts,1);
});

for(const denial of ['human','bot','unknown'] as const)test(`fresh handoff ${denial} control failure never sends`,async()=>{
 const {a}=await ready(),p=await work(a);if(denial==='human')failHuman=true;if(denial==='bot')failBot=true;if(denial==='unknown')unavailable=true;
 assert.equal((await processPublication(p.id)).status,'REQUIRES_RECONNECT');assert.equal(starts,0);
});
test('final real user lock wait enforces control freshness after lock acquisition',async context=>{
 const {a}=await ready(),p=await work(a),blocker=await getPool().connect(),observer=await getPool().connect();
 let clock=Date.now();context.mock.method(Date,'now',()=>clock);
 const blockerPid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
 let finalPhase=false,submitted!:(pid:number)=>void;const querySubmitted=new Promise<number>(r=>submitted=r);
 const query=Client.prototype.query;
 context.mock.method(Client.prototype,'query',function(this:Client,...args:unknown[]){
  const config=args[0],text=typeof config==='string'?config:config && typeof config==='object' && 'text' in config?config.text:undefined;
  const result=Reflect.apply(query,this,args);
  if(finalPhase && typeof text==='string' && text.includes('from "users"') && text.endsWith('for update')){finalPhase=false;submitted((this as Client & {processID:number}).processID);}
  return result;
 } as Client['query']);
 globalThis.fetch=async(input,init)=>{
  const response=await fetcher(input,init);
  if(String(input).endsWith('/getChatMember') && JSON.parse(String(init?.body)).user_id===42){await blocker.query('BEGIN');await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[a.id]);finalPhase=true;}
  return response;
 };
 const job=processPublication(p.id),outcome=job.then(value=>({value}),error=>({error}));
 try {
  const signal=AbortSignal.timeout(5000);
  const targetPid=await Promise.race([querySubmitted,new Promise<never>((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('Final user query not submitted')),{once:true}))]);
  let blocked=false;const until=performance.now()+5000;
  while(!blocked && performance.now()<until){const result=await observer.query('SELECT state,wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[targetPid]);const r=result.rows[0];blocked=r?.state==='active' && r.wait_event_type==='Lock' && r.blockers.includes(blockerPid);}
  assert.equal(blocked,true,'actual final user lock must wait on controlled blocker');
  clock+=30001;
 }finally{await blocker.query('ROLLBACK');blocker.release();observer.release();await outcome;}
 assert.equal((await job).status,'REQUIRES_RECONNECT');assert.equal(starts,0);
});

test('real post creation rolls back failed USER admission while private draft remains allowed',async()=>{
 const a=await actor('rollback');
 const input={baseText:'private',status:'READY' as const,mediaIds:[],targets:[{provider:'telegram' as const,textOverride:null,scheduledAt:'2030-01-01T09:00:00.000Z'}]};
 await assert.rejects(()=>createPost(a.id,input),(error:unknown)=>apiError(error).status===403);
 assert.equal((await getDb().select().from(schema.posts).where(eq(schema.posts.userId,a.id))).length,0);
 assert.equal((await getDb().select().from(schema.publications).where(eq(schema.publications.userId,a.id))).length,0);
 const draft=await createPost(a.id,{...input,status:'DRAFT'},{mirrorQueue:async()=>{}});assert.equal(draft.status,'DRAFT');assert.equal(draft.baseText,'private');
});
for(const uncertain of [false,true])test(`admitted ${uncertain?'ambiguous':'confirmed'} outcome survives user block`,async()=>{
 const {a}=await ready(),p=await work(a);let enter!:()=>void,release!:()=>void;
 const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);sendHold=async()=>{enter();await gate;};
 const job=processPublication(p.id);assert.equal(await Promise.race([entered.then(()=>true),job.then(()=>false)]),true);
 await setUserAccessState(a.id,'BLOCKED');sendError=uncertain;release();assert.equal((await job).status,uncertain?'FAILED':'PUBLISHED');
 const [saved]=await getDb().select().from(schema.publications).where(eq(schema.publications.id,p.id));assert.equal(uncertain?saved.providerErrorCode:saved.providerRemoteId,uncertain?'AMBIGUOUS_DELIVERY':'9');
 await processPublication(p.id);assert.equal(starts,1);
});

for(const provider of ['TELEGRAM','MAX'] as const)test(`${provider} direct enable fences late AUTH from two admitted sends without pause`,async()=>{
 const {a,l}=await ready(provider),pA=await work(a);
 await getDb().insert(schema.posts).values({id:'e4p-post-b',userId:a.id,baseText:'private B',status:'READY'});
 await getDb().insert(schema.postTargets).values({id:'e4p-target-b',postId:'e4p-post-b',socialAccountId:a.account.id,active:true,scheduledAt:new Date(BASE+999999)});
 await reconcilePostPublications(a.id,'e4p-post-b');
 const [pB]=await getDb().select().from(schema.publications).where(eq(schema.publications.postId,'e4p-post-b'));
 let enteredA!:()=>void,enteredB!:()=>void,releaseA!:()=>void,releaseB!:()=>void;
 const entryA=new Promise<void>(r=>enteredA=r),entryB=new Promise<void>(r=>enteredB=r);
 const gateA=new Promise<void>(r=>releaseA=r),gateB=new Promise<void>(r=>releaseB=r);
 let ordinal=0;
 sendHold=async()=>{if(++ordinal===1){enteredA();await gateA;}else{enteredB();await gateB;}};
 const jobA=processPublication(pA.id);let jobB:ReturnType<typeof processPublication>|undefined;
 try {
 assert.equal(await Promise.race([entryA.then(()=>true),jobA.then(()=>false)]),true);
 jobB=processPublication(pB.id);
 assert.equal(await Promise.race([entryB.then(()=>true),jobB.then(()=>false)]),true);
 const generationBefore=(await row(a.account.id)).connectionGeneration;
 authError=true;releaseA();
 assert.equal((await jobA).status,'REQUIRES_RECONNECT');
 assert.equal((await row(a.account.id)).connectionStatus,'ERROR');
 await l.enable(a.raw,a.account.id,1);
 const afterEnable=await row(a.account.id);
 assert.equal(afterEnable.connectionStatus,'CONNECTED');
 releaseB();assert.equal((await jobB).status,'REQUIRES_RECONNECT');
 const afterLateAuth=await row(a.account.id);
 assert.equal(afterLateAuth.connectionStatus,'CONNECTED','late AUTH must not overwrite fresh successful enable');
 assert.equal(afterLateAuth.enabled,true);assert.equal(afterEnable.connectionGeneration,generationBefore+1);assert.equal(afterLateAuth.connectionGeneration,afterEnable.connectionGeneration);
 assert.equal(afterLateAuth.bindingRevision,1);assert.equal(afterLateAuth.providerAccountId,provider==='MAX'?'-66666':'-12345');
 const [binding]=await getDb().select().from(schema.socialBindings).where(eq(schema.socialBindings.accountId,a.account.id));assert.equal(binding.revision,1);assert.equal(binding.destinationId,provider==='MAX'?'-66666':'-12345');
 for(const id of [pA.id,pB.id]){
  const [saved]=await getDb().select().from(schema.publications).where(eq(schema.publications.id,id));
  assert.equal(saved.status,'REQUIRES_RECONNECT');assert.equal(saved.normalizedErrorType,'AUTH');assert.equal(saved.socialBindingRevision,1);assert.equal(saved.socialBindingDestinationId,provider==='MAX'?'-66666':'-12345');
  await processPublication(id);
 }
 assert.equal(starts,2);
 }finally{releaseA();releaseB();await Promise.allSettled([jobA,...(jobB?[jobB]:[])]);}
});
