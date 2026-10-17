import { Client } from 'pg';
import { reconcilePostPublicationsInTx } from '../lib/server/publications.ts';
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
const TOKEN='123456:TEST_only_never_real_secret', BASE=1800000000000;
let now=BASE, requests=0, failHuman=false, failBot=false, unavailable=false, wrongDestination=false;
let hold: (()=>Promise<void>)|undefined;
const fetcher:typeof fetch=async (input,init)=>{
  requests++; if(hold) await hold();
  if(unavailable) return Response.json({ok:false,error_code:503},{status:503});
  const url=new URL(String(input));
  if(url.hostname==='platform-api2.max.ru') {
    if(url.pathname==='/me') return Response.json({user_id:7,is_bot:true});
    if(url.pathname.endsWith('/members/me')) return Response.json({user_id:7,is_bot:true,is_owner:false,is_admin:!failBot,permissions:['write']});
    if(url.pathname.endsWith('/members')) return Response.json({members:[{user_id:42,is_bot:false,is_owner:false,is_admin:!failHuman,permissions:['write']}]});
    return Response.json({chat_id:Number(url.pathname.split('/')[2]),type:'channel',status:'active',title:'Fixture D'});
  }
  if(url.hostname!=='api.telegram.org')throw new Error('Unexpected host');
  const body=JSON.parse(String(init?.body??'{}'));
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
 const db=getDb(),id=`e4-${name}`,raw=`synthetic-session-${name}-${randomUUID()}`;
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
const denied=(job:()=>Promise<unknown>)=>assert.rejects(job,(e:unknown)=>e instanceof Error && e.name==='SocialConnectionError' && !e.message.includes(TOKEN));
async function row(id:string){return (await getDb().select().from(schema.socialAccounts).where(eq(schema.socialAccounts.id,id)))[0];}
beforeEach(async()=>{
 await getDb().delete(schema.users).where(like(schema.users.id,'e4-%'));
 await getDb().delete(schema.socialProofRateLimits);
 globalThis.fetch=fetcher;now=BASE;requests=0;failHuman=false;failBot=false;unavailable=false;wrongDestination=false;hold=undefined;
 process.env.TELEGRAM_BOT_TOKEN=TOKEN;process.env.TELEGRAM_MINI_APP_URL='https://t.me/test_bot';
 process.env.MAX_BOT_TOKEN='MAX_TEST_ONLY_secret';process.env.MAX_MINI_APP_URL='https://max.ru/test_bot';
});
after(async()=>{globalThis.fetch=originalFetch;await getDb().delete(schema.users).where(like(schema.users.id,'e4-%'));await getDb().delete(schema.socialProofRateLimits);await closeDb();});

async function lifecycle() {
 return createSocialConnectionLifecycle({now:()=>now,fetcher});
}
async function verified(provider:'TELEGRAM'|'MAX'='TELEGRAM') {
 const s=await service(),a=await actor('lifecycle',provider),t=await ticket(s,a,provider==='MAX'?'-66666':'-12345');
 await s.confirm(a.raw,t.received.ticket);return {s,a};
}
test('pause preserves reservation and cancels pending proof without provider reads',async()=>{
 const {s,a}=await verified(),l=await lifecycle();
 await l.enable(a.raw,a.account.id,1);const pending=await ticket(s,a);const calls=requests;
 await l.pause(a.raw,a.account.id,1);
 assert.equal(requests,calls);assert.equal((await row(a.account.id)).enabled,false);
 assert.equal((await getDb().select().from(schema.socialBindings).where(like(schema.socialBindings.userId,'e4-%'))).length,1);
 await denied(()=>s.confirm(a.raw,pending.received.ticket));
});
for(const failure of ['human','bot','unknown'] as const)test(`enable rejects ${failure} with no cached positive`,async()=>{
 const {a}=await verified(),l=await lifecycle();
 if(failure==='human')failHuman=true;if(failure==='bot')failBot=true;if(failure==='unknown')unavailable=true;
 await denied(()=>l.enable(a.raw,a.account.id,1));assert.equal((await row(a.account.id)).enabled,false);
});
for(const provider of ['TELEGRAM','MAX'] as const)test(`${provider} enable independently checks H and B and creates no work`,async()=>{
 const {a}=await verified(provider),l=await lifecycle(),before=requests;
 await l.enable(a.raw,a.account.id,1);assert.ok(requests>before);assert.equal((await row(a.account.id)).enabled,true);
 assert.equal((await getDb().select().from(schema.publications).where(like(schema.publications.userId,'e4-%'))).length,0);
});
for(const change of ['pause','reproof','config','stale-time'] as const)test(`old enable cannot commit after ${change}`,async()=>{
 const {s,a}=await verified(),l=await lifecycle();let enter!:()=>void,release!:()=>void;
 const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);let once=true;
 hold=async()=>{if(once){once=false;enter();await gate;}};
 const old=l.enable(a.raw,a.account.id,1);await entered;
 if(change==='pause')await l.pause(a.raw,a.account.id,1);
 if(change==='reproof'){const t=await ticket(s,a);await s.confirm(a.raw,t.received.ticket);}
 if(change==='config')process.env.TELEGRAM_MINI_APP_URL='https://t.me/other_bot';
 if(change==='stale-time')now+=30001;
 release();await denied(()=>old);assert.equal((await row(a.account.id)).enabled,false);
});
async function work(a:Awaited<ReturnType<typeof actor>>,status:string|null,postStatus:'READY'|'DRAFT'='READY') {
 await getDb().insert(schema.posts).values({id:'e4-post',userId:a.id,baseText:'private',status:postStatus});
 await getDb().insert(schema.postTargets).values({id:'e4-target',postId:'e4-post',socialAccountId:a.account.id,active:true,scheduledAt:new Date(BASE+999999)});
 if(status)await getDb().insert(schema.publications).values({id:'e4-publication',userId:a.id,postId:'e4-post',postTargetId:'e4-target',provider:a.account.provider,status:status==='AMBIGUOUS'?'FAILED':status as 'PUBLISHED',providerErrorCode:status==='AMBIGUOUS'?'AMBIGUOUS_DELIVERY':null,providerRemoteId:status==='PUBLISHED'?'confirmed':null,idempotencyKey:'e4-publication'});
}
for(const status of ['SCHEDULED','QUEUED','PUBLISHING','AMBIGUOUS','REQUIRES_RECONNECT',null])test(`release refuses approved ${status??'missing publication'} without deleting work`,async()=>{
 const {a}=await verified(),l=await lifecycle();await work(a,status);await denied(()=>l.release(a.raw,a.account.id,1));
 assert.equal((await getDb().select().from(schema.socialBindings).where(like(schema.socialBindings.userId,'e4-%'))).length,1);
 assert.equal((await getDb().select().from(schema.postTargets).where(eq(schema.postTargets.id,'e4-target'))).length,1);
});
for(const status of ['PUBLISHED',null])test(`release after demotion allows ${status??'DRAFT'} and retains private history`,async()=>{
 const {a}=await verified(),l=await lifecycle();await work(a,status,status?'READY':'DRAFT');failHuman=true;const before=requests;
 await l.release(a.raw,a.account.id,1);assert.equal(requests,before);
 const account=await row(a.account.id);assert.equal(account.enabled,false);assert.equal(account.providerAccountId,null);assert.equal(account.bindingRevision,2);
 assert.equal((await getDb().select().from(schema.socialBindings).where(like(schema.socialBindings.userId,'e4-%'))).length,0);assert.equal((await getDb().select().from(schema.posts).where(eq(schema.posts.id,'e4-post')))[0].baseText,'private');
 if(status)assert.equal((await getDb().select().from(schema.publications).where(like(schema.publications.userId,'e4-%')))[0].providerRemoteId,'confirmed');
 await denied(()=>l.release(a.raw,a.account.id,1));
});
test('foreign absent session and stale revision cannot change lifecycle',async()=>{
 const {a}=await verified(),b=await actor('foreign'),l=await lifecycle();
 for(const action of ['pause','enable','release'] as const){await denied(()=>l[action](b.raw,a.account.id,1));await denied(()=>l[action]('',a.account.id,1));await denied(()=>l[action](a.raw,a.account.id,0));}
 assert.equal((await row(a.account.id)).bindingRevision,1);
});

test('lifecycle HTTP authenticates and applies strict body origin and expected revision',async()=>{
 const {a}=await verified();
 for(const action of ['pause','enable','release'] as const) {
  const route=await import(`../app/api/social-connections/accounts/[id]/${action}/route.ts`);
  const request=(body:unknown,headers:Record<string,string>={})=>new Request(`https://planly.test/api/social-connections/accounts/${a.account.id}/${action}`,{method:'POST',headers:{origin:'https://planly.test','content-type':'application/json','X-Planly-Social-Connection':'1',cookie:`planly_session=${a.raw}`,...headers},body:JSON.stringify(body)});
  for(const [body,headers,status] of [ [{bindingRevision:1},{cookie:''},401],[{bindingRevision:1},{origin:'https://foreign.test'},403],[{bindingRevision:1,humanId:'42'},{},422],[{bindingRevision:'1'},{},422],[{bindingRevision:0},{},403] ] as [unknown,Record<string,string>,number][])assert.equal((await route.POST(request(body,headers),{params:Promise.resolve({id:a.account.id})})).status,status);
  const result=await route.POST(request({bindingRevision:1}),{params:Promise.resolve({id:a.account.id})});assert.equal(result.status,200);
  assert.equal(result.headers.get('cache-control'),'private, no-store');
 }
});

test('release waits for admitted work under the same native user lock and refuses it',async context=>{
 const {a}=await verified(),l=await lifecycle();await l.enable(a.raw,a.account.id,1);await work(a,null);
 let releaseAdmission!:()=>void,admitted!:()=>void;
 const admissionGate=new Promise<void>(r=>releaseAdmission=r),admissionReady=new Promise<void>(r=>admitted=r);
 const admission=getDb().transaction(async tx=>{
  await tx.select().from(schema.users).where(eq(schema.users.id,a.id)).for('update');
  await reconcilePostPublicationsInTx(tx,a.id,'e4-post');admitted();await admissionGate;
 });await admissionReady;
 let submitted!:(pid:number)=>void;const started=new Promise<number>(r=>submitted=r),query=Client.prototype.query;
 context.mock.method(Client.prototype,'query',function(this:Client,...args:unknown[]){
  const config=args[0],text=typeof config==='string'?config:config && typeof config==='object' && 'text' in config?config.text:undefined;
  const result=Reflect.apply(query,this,args);
  if(typeof text==='string' && text.includes('from "users"') && text.endsWith('for update'))submitted((this as Client & {processID:number}).processID);
  return result;
 } as Client['query']);
 const pending=l.release(a.raw,a.account.id,1),outcome=pending.then(value=>({value}),error=>({error}));
 try {
  const signal=AbortSignal.timeout(5000);
  const pid=await Promise.race([started,new Promise<never>((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('Release user query not submitted')),{once:true}))]);
  let blocked=false;const until=performance.now()+5000;
  while(!blocked && performance.now()<until){const r=await getPool().query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid]);blocked=r.rows[0]?.wait_event_type==='Lock';}
  assert.equal(blocked,true,'release must serialize behind real admission user lock');
 }finally{releaseAdmission();await admission;await outcome;}
 await denied(()=>pending);assert.equal((await row(a.account.id)).providerAccountId,'-12345');
 assert.equal((await getDb().select().from(schema.publications).where(eq(schema.publications.postId,'e4-post'))).length,1);
});
