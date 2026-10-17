import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import { getDb, getPool, closeDb } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { ensureOwnerSocialAccounts, connectSocialAccount } from '../lib/server/social-accounts.ts';
import { sessionTokenHash, deleteSessionByToken } from '../lib/server/auth/session.ts';
import { setUserAccessState } from '../lib/server/auth/access.ts';
import { createSocialConnectionService } from '../lib/server/social-connections/service.ts';
import { invalidateConnectionIntents, lockConnectionActor, lockOwnedConnectionAccount } from '../lib/server/social-connections/state.ts';
import { Client } from 'pg';

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
 const db=getDb(),id=`e2-${name}`,raw=`synthetic-session-${name}-${randomUUID()}`;
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
 await getDb().delete(schema.users).where(like(schema.users.id,'e2-%'));
 await getDb().delete(schema.socialProofRateLimits);
 now=BASE;requests=0;failHuman=false;failBot=false;unavailable=false;wrongDestination=false;hold=undefined;
 process.env.TELEGRAM_BOT_TOKEN=TOKEN;process.env.TELEGRAM_MINI_APP_URL='https://t.me/test_bot';
 process.env.MAX_BOT_TOKEN='MAX_TEST_ONLY_secret';process.env.MAX_MINI_APP_URL='https://max.ru/test_bot';
});
after(async()=>{await getDb().delete(schema.users).where(like(schema.users.id,'e2-%'));await getDb().delete(schema.socialProofRateLimits);await closeDb();});

test('signed P/H/D/B creates disabled verified binding and idempotent durable receipt',async()=>{
 const s=await service(),a=await actor('valid'),t=await ticket(s,a,'@alias_one');
 assert.equal((await row(a.account.id)).connectionStatus,'DISCONNECTED');
 const preview=await s.preview(a.raw,t.received.ticket);assert.equal(preview.destinationId,'-12345');assert.equal(preview.humanId,'42');
 const result=await s.confirm(a.raw,t.received.ticket);assert.equal(result.state,'VERIFIED_DISABLED');assert.equal(result.bindingRevision,1);
 const account=await row(a.account.id);assert.equal(account.enabled,false);assert.equal(account.providerAccountId,'-12345');assert.equal(account.connectionStatus,'CONNECTED');
 const bindings=await getDb().select().from(schema.socialBindings).where(eq(schema.socialBindings.accountId,a.account.id));
 assert.equal(bindings.length,1);assert.equal(bindings[0].humanId,'42');assert.equal(bindings[0].botId,'123456');
 const count=requests;assert.deepEqual(await s.confirm(a.raw,t.received.ticket),result);assert.equal(requests,count);
 const persisted=JSON.stringify(await getDb().select().from(schema.socialConnectionIntents));
 for(const raw of [a.raw,t.received.ticket,new URL(t.start.launchUrl).searchParams.get('startapp')!,t.proof,TOKEN]) assert.equal(persisted.includes(raw),false);
 assert.equal(JSON.stringify(t.start).includes('humanId'),false);
});
test('MAX shares exact-session protocol with independent platform proof',async()=>{
 const s=await service(),a=await actor('max','MAX'),t=await ticket(s,a,'-66666');const result=await s.confirm(a.raw,t.received.ticket);
 assert.equal(result.provider,'MAX');assert.equal((await row(a.account.id)).enabled,false);
});
test('unsafe or missing setup fails before fetch and intent commit',async()=>{
 const s=await service(),a=await actor('setup');
 for(const url of ['', 'http://t.me/test_bot','https://evil.test/test_bot','https://t.me/test_bot/app','https://u@t.me/test_bot','https://t.me:444/test_bot','https://t.me/test_bot?x=1','https://t.me/test_bot#x']) {
  process.env.TELEGRAM_MINI_APP_URL=url;await denied(()=>s.start(a.raw,a.account.id,'-12345'));
 }
 assert.equal(requests,0);assert.equal((await getDb().select().from(schema.socialConnectionIntents)).length,0);
});
test('foreign accounts VK and absent sessions cannot create intent',async()=>{
 const s=await service(),a=await actor('owner'),b=await actor('foreign'),v=await actor('vk','VK');
 await denied(()=>s.start(b.raw,a.account.id,'-12345'));await denied(()=>s.start('',a.account.id,'-12345'));await denied(()=>s.start(v.raw,v.account.id,'1'));assert.equal(requests,0);
});
test('preview needs ticket and exact original session without burning rightful proof',async()=>{
 const s=await service(),a=await actor('preview'),b=await actor('preview-b'),t=await ticket(s,a);
 const second='synthetic-second-session';await getDb().insert(schema.sessions).values({id:randomUUID(),userId:a.id,tokenHash:sessionTokenHash(second),sessionVersion:0,expiresAt:new Date(BASE+999999)});
 for(const raw of [b.raw,second]) {await denied(()=>s.preview(raw,t.received.ticket));await denied(()=>s.confirm(raw,t.received.ticket));}
 await denied(()=>s.preview(a.raw,t.start.operationId));await denied(()=>s.preview(a.raw,t.received.ticket+'x'));
 assert.equal((await s.preview(a.raw,t.received.ticket)).humanId,'42');assert.equal((await s.preview(a.raw,t.received.ticket)).humanId,'42');await s.confirm(a.raw,t.received.ticket);
});
test('proof CAS and equivalent encoding cannot mint two tickets',async()=>{
 const s=await service(),a=await actor('replay'),start=await s.start(a.raw,a.account.id,'-12345'),proof=signed(start.launchUrl);
 const equivalent=proof.split('&').reverse().join('&').replaceAll('%3A','%3a');
 const outcomes=await Promise.allSettled([s.receive('TELEGRAM',proof),s.receive('TELEGRAM',equivalent)]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal((await getDb().select().from(schema.socialConnectionIntents)).filter(x=>x.ticketHash).length,1);
 await denied(()=>s.receive('TELEGRAM',proof));assert.equal((await row(a.account.id)).providerAccountId,null);
});
test('unproved intents reserve no canonical destination',async()=>{
 const s=await service(),a=await actor('pending'),b=await actor('free');await s.start(a.raw,a.account.id,'@alias_one');const t=await ticket(s,b);await s.confirm(b.raw,t.received.ticket);assert.equal((await row(a.account.id)).providerAccountId,null);
});
test('fully proven users racing aliases yield one binding and closed conflict',async()=>{
 const s=await service(),a=await actor('race-a'),b=await actor('race-b'),ta=await ticket(s,a,'@alias_one'),tb=await ticket(s,b,'@alias_two');
 const results=await Promise.allSettled([s.confirm(a.raw,ta.received.ticket),s.confirm(b.raw,tb.received.ticket)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await getDb().select().from(schema.socialBindings)).length,1);
 const loser=results[0].status==='rejected'?a:b;assert.equal((await row(loser.account.id)).providerAccountId,null);
 assert.equal((await getDb().select().from(schema.socialConnectionIntents)).filter(x=>x.state==='FAILED').length,1);
});
test('one human can bind different destinations for independent Planly users',async()=>{
 const s=await service(),a=await actor('different-a'),b=await actor('different-b'),ta=await ticket(s,a,'-12345'),tb=await ticket(s,b,'-67890');
 await Promise.all([s.confirm(a.raw,ta.received.ticket),s.confirm(b.raw,tb.received.ticket)]);assert.equal((await getDb().select().from(schema.socialBindings)).length,2);
});
test('logout invalidates ticket while verified binding survives',async()=>{
 const s=await service(),a=await actor('logout'),t=await ticket(s,a);await deleteSessionByToken(a.raw);await denied(()=>s.confirm(a.raw,t.received.ticket));
 const b=await actor('durable'),tb=await ticket(s,b);await s.confirm(b.raw,tb.received.ticket);await deleteSessionByToken(b.raw);
 assert.equal((await getDb().select().from(schema.socialBindings)).length,1);await denied(()=>s.confirm(b.raw,tb.received.ticket));
});
test('block restore epoch and bot config rotation reject old proofs',async()=>{
 const s=await service(),a=await actor('epoch'),t=await ticket(s,a);await setUserAccessState(a.id,'BLOCKED');await setUserAccessState(a.id,'ACTIVE');await denied(()=>s.confirm(a.raw,t.received.ticket));
 const b=await actor('config'),tb=await ticket(s,b);process.env.TELEGRAM_BOT_TOKEN=TOKEN+'_rotated';await denied(()=>s.preview(b.raw,tb.received.ticket));assert.equal((await row(b.account.id)).providerAccountId,null);
});
for(const staleError of [false,true])test(`new generation rejects awaited ${staleError?'failure':'success'} without clobbering newer intent`,async()=>{
 const s=await service(),a=await actor('generation'),t=await ticket(s,a);
 let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);let once=true;
 hold=async()=>{if(once){once=false;entered();await gate;}};
 const old=s.confirm(a.raw,t.received.ticket);await ready;const next=await s.start(a.raw,a.account.id,'-67890');unavailable=staleError;release();await denied(()=>old);unavailable=false;
 const nt=await s.receive('TELEGRAM',signed(next.launchUrl));await s.confirm(a.raw,nt.ticket);assert.equal((await row(a.account.id)).providerAccountId,'-67890');
});
test('ticket expires at signed auth plus five minutes without extension',async()=>{
 const s=await service(),a=await actor('expiry'),start=await s.start(a.raw,a.account.id,'-12345');const t=await s.receive('TELEGRAM',signed(start.launchUrl,42,now-299000));
 now+=1001;await denied(()=>s.preview(a.raw,t.ticket));assert.equal((await row(a.account.id)).providerAccountId,null);
});
test('control check older than thirty seconds cannot commit',async()=>{
 const s=await service(),a=await actor('freshness'),t=await ticket(s,a);let once=true;hold=async()=>{if(once){once=false;now+=30001;}};
 await denied(()=>s.confirm(a.raw,t.received.ticket));assert.equal((await getDb().select().from(schema.socialBindings)).length,0);
});
for(const condition of ['human','bot','unavailable','canonical'] as const)test(`control ${condition} failure leaves no partial claim`,async()=>{
 const s=await service(),a=await actor(`control-${condition}`),t=await ticket(s,a);
 failHuman=condition==='human';failBot=condition==='bot';unavailable=condition==='unavailable';wrongDestination=condition==='canonical';
 await denied(()=>s.confirm(a.raw,t.received.ticket));assert.equal((await row(a.account.id)).providerAccountId,null);assert.equal((await getDb().select().from(schema.socialBindings)).length,0);
});
test('foreign legacy numeric and unresolved alias destinations remain protected',async()=>{
 const s=await service(),a=await actor('claim'),legacy=await actor('legacy');
 for(const destination of ['-12345','@unknown_alias']) {
  await getDb().update(schema.socialAccounts).set({providerAccountId:destination,connectionStatus:'CONNECTED',enabled:true}).where(eq(schema.socialAccounts.id,legacy.account.id));
  const t=await ticket(s,a);await denied(()=>s.confirm(a.raw,t.received.ticket));assert.equal((await row(legacy.account.id)).providerAccountId,destination);
 }
});
test('legacy bot connect cannot steal verified destination',async()=>{
 const s=await service(),a=await actor('claimed'),t=await ticket(s,a);await s.confirm(a.raw,t.received.ticket);
 const legacy=await actor('old');await getDb().update(schema.users).set({authInitialized:false}).where(eq(schema.users.id,legacy.id));
 const original=globalThis.fetch;globalThis.fetch=fetcher;
 try {const result=await connectSocialAccount(legacy.id,legacy.account.id,'@alias_one');assert.equal('ok' in result && result.ok===false,true);assert.equal((await row(legacy.account.id)).providerAccountId,null);}finally{globalThis.fetch=original;}
});
test('start attempts bounded and no incomplete intent reserves destination',async()=>{
 const s=await service(),a=await actor('bounded');for(let i=0;i<10;i++) await s.start(a.raw,a.account.id,'-12345');await denied(()=>s.start(a.raw,a.account.id,'-12345'));
 assert.equal((await getDb().select().from(schema.socialBindings)).length,0);assert.equal((await getDb().select().from(schema.socialConnectionIntents)).filter(x=>x.state==='PENDING').length,1);
});

test('receipt insert conflict rolls back binding and account update together',async()=>{
 const s=await service(),a=await actor('atomic'),t=await ticket(s,a);
 await getDb().insert(schema.socialConnectionReceipts).values({operationId:t.start.operationId,userId:a.id,accountId:a.account.id,sessionId:'unrelated',sessionVersion:0,generation:0,configRevision:'0'.repeat(64),ticketHash:'0'.repeat(64),receipt:{operationId:t.start.operationId,accountId:a.account.id,provider:'TELEGRAM',destinationId:'-999',bindingRevision:99,state:'VERIFIED_DISABLED'}});
 await denied(()=>s.confirm(a.raw,t.received.ticket));assert.equal((await row(a.account.id)).bindingRevision,0);assert.equal((await row(a.account.id)).providerAccountId,null);
 assert.equal((await getDb().select().from(schema.socialBindings)).length,0);
 assert.equal((await getDb().select().from(schema.socialConnectionIntents))[0].state,'FAILED');
});
test('only one confirm performs live control while concurrent finish is pending',async()=>{
 const s=await service(),a=await actor('one-check'),t=await ticket(s,a);let release!:()=>void,entered!:()=>void;
 const ready=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);let once=true;
 hold=async()=>{if(once){once=false;entered();await gate;}};
 const first=s.confirm(a.raw,t.received.ticket);await ready;const count=requests;await denied(()=>s.confirm(a.raw,t.received.ticket));assert.equal(requests,count);
 release();const result=await first;assert.deepEqual(await (await service()).confirm(a.raw,t.received.ticket),result);
});
for(const mode of ['pause','logout','config'] as const)test(`${mode} during awaited control invalidates its result`,async()=>{
 const s=await service(),a=await actor('await-boundary'),t=await ticket(s,a);let release!:()=>void,entered!:()=>void;
 const ready=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);let once=true;
 hold=async()=>{if(once){once=false;entered();await gate;}};
 const pending=s.confirm(a.raw,t.received.ticket);await ready;
 if(mode==='logout') await deleteSessionByToken(a.raw);
 if(mode==='config') process.env.TELEGRAM_MINI_APP_URL='https://t.me/new_test_bot';
 if(mode==='pause') await getDb().transaction(async tx=>{const user=await lockConnectionActor(tx,sessionTokenHash(a.raw),now);await lockOwnedConnectionAccount(tx,user,a.account.id,now);await invalidateConnectionIntents(tx,a.account.id);});
 release();await denied(()=>pending);assert.equal((await row(a.account.id)).providerAccountId,null);
});
test('signed expiry and intent expiry both prevent a fresh ticket',async()=>{
 const s=await service(),a=await actor('raw-expiry'),start=await s.start(a.raw,a.account.id,'-12345');
 await denied(()=>s.receive('TELEGRAM',signed(start.launchUrl,42,now-300001)));
 now+=300001;await denied(()=>s.receive('TELEGRAM',signed(start.launchUrl)));
 assert.equal((await getDb().select().from(schema.socialBindings)).length,0);
});
test('completed receipt is own-session only and cannot overwrite a later generation',async()=>{
 const s=await service(),a=await actor('old-receipt'),b=await actor('receipt-other'),t=await ticket(s,a);await s.confirm(a.raw,t.received.ticket);
 await denied(()=>s.confirm(b.raw,t.received.ticket));const next=await ticket(s,a);await denied(()=>s.confirm(a.raw,t.received.ticket));await s.confirm(a.raw,next.received.ticket);
 assert.equal((await row(a.account.id)).bindingRevision,2);
});
test('ingress rejects body overflow and bounds forged proof attempts',async()=>{
 const s=await service();await denied(()=>s.receive('TELEGRAM','x'.repeat(16385)));
 for(let i=0;i<120;i++) await denied(()=>s.receive('TELEGRAM','forged'));
 await assert.rejects(()=>s.receive('TELEGRAM','forged'),(e:unknown)=>e instanceof Error && 'code' in e && e.code==='LIMITED');
 assert.equal((await getDb().select().from(schema.socialConnectionIntents)).length,0);assert.equal(requests,0);
});

for(const legacyFirst of [true,false])test(`legacy/new canonical claim serialization with ${legacyFirst?'legacy':'verified'} winner`,async()=>{
 const s=await service(),a=await actor('race-new'),legacy=await actor('race-legacy'),t=await ticket(s,a);
 await getDb().update(schema.users).set({authInitialized:false}).where(eq(schema.users.id,legacy.id));
 let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);let once=true;
 hold=async()=>{if(once){once=false;entered();await gate;}};
 const original=globalThis.fetch;globalThis.fetch=fetcher;
 try {
  if(legacyFirst) {
   const pending=s.confirm(a.raw,t.received.ticket);await ready;
   const winner=await connectSocialAccount(legacy.id,legacy.account.id,'@alias_one');assert.ok(!('ok' in winner));release();await denied(()=>pending);
  } else {
   const pending=connectSocialAccount(legacy.id,legacy.account.id,'@alias_one');await ready;
   await s.confirm(a.raw,t.received.ticket);release();const loser=await pending;assert.equal('ok' in loser && loser.ok===false,true);
  }
  const accounts=await Promise.all([row(a.account.id),row(legacy.account.id)]);assert.equal(accounts.filter(x=>x.providerAccountId==='-12345').length,1);
 } finally {release?.();globalThis.fetch=original;}
});
test('pause while start awaits bot validation cannot create a stale intent',async()=>{
 const s=await service(),a=await actor('start-await');let release!:()=>void,entered!:()=>void;
 const ready=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);let once=true;
 hold=async()=>{if(once){once=false;entered();await gate;}};
 const pending=s.start(a.raw,a.account.id,'-12345');await ready;
 await getDb().transaction(async tx=>{const user=await lockConnectionActor(tx,sessionTokenHash(a.raw),now);await lockOwnedConnectionAccount(tx,user,a.account.id,now);await invalidateConnectionIntents(tx,a.account.id);});
 release();await denied(()=>pending);assert.equal((await getDb().select().from(schema.socialConnectionIntents)).length,0);
});
test('existing legacy destination cannot be replaced before explicit release',async()=>{
 const s=await service(),a=await actor('legacy-switch');
 await getDb().update(schema.socialAccounts).set({providerAccountId:'-54321',connectionStatus:'CONNECTED',enabled:true}).where(eq(schema.socialAccounts.id,a.account.id));
 await denied(()=>s.start(a.raw,a.account.id,'-12345'));assert.equal((await row(a.account.id)).providerAccountId,'-54321');
});
test('session expiring while waiting for its row lock cannot authorize confirmation',async context=>{
 const s=await service(),a=await actor('session-lock-expiry'),t=await ticket(s,a);
 await getDb().update(schema.sessions).set({expiresAt:new Date(now+1000)}).where(eq(schema.sessions.userId,a.id));
 const blocker=await getPool().connect();
 // Reserve a separate observer before confirmation. Observations must not take
 // its idle connection and race a new backend's connection/startup handshake.
 const observer=await getPool().connect();
 const blockerPid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
 let finalPhase=false,queryStarted!:((pid:number)=>void);
 const started=new Promise<number>(resolve=>queryStarted=resolve);
 const originalQuery=Client.prototype.query;
 // Observe the real driver's submission; no database operation is replaced.
 context.mock.method(Client.prototype,'query',function(this:Client,...args:unknown[]) {
  const config=args[0],text=typeof config==='string'?config:config && typeof config==='object' && 'text' in config?config.text:undefined;
  const result=Reflect.apply(originalQuery,this,args);
  if(finalPhase && typeof text==='string' && text.includes('from "sessions"') && text.endsWith('for update')) {
   finalPhase=false;queryStarted((this as Client & {processID:number}).processID);
  }
  return result;
 } as Client['query']);
 const finishing=createSocialConnectionService({now:()=>now,fetcher:async(input,init)=>{
  const response=await fetcher(input,init);
  if(String(input).endsWith('/getChatMember') && JSON.parse(String(init?.body)).user_id===42) {
   await blocker.query('BEGIN');await blocker.query('SELECT id FROM sessions WHERE user_id=$1 FOR UPDATE',[a.id]);finalPhase=true;
  }
  return response;
 }});
 const pending=finishing.confirm(a.raw,t.received.ticket);
 // Handle a premature failure while waiting for evidence, without losing it.
 const outcome=pending.then(value=>({value}),error=>({error}));
 try {
  const deadline=AbortSignal.timeout(5000);
  const targetPid=await Promise.race([started,new Promise<never>((_,reject)=>deadline.addEventListener('abort',()=>reject(new Error('Final session lock query was never submitted')),{once:true}))]);
  let blocked=false;
  let evidence: {pid:number;state:string;wait_event_type:string;blockers:number[];query:string}|undefined;
  for(let i=0;i<100 && !blocked;i++) {
   const result=await observer.query('SELECT pid,state,wait_event_type,pg_blocking_pids(pid) AS blockers,query FROM pg_stat_activity WHERE datname=current_database() AND pid=$1',[targetPid]);
   evidence=result.rows[0];
   blocked=evidence?.state==='active' && evidence.wait_event_type==='Lock' && evidence.blockers.includes(blockerPid) && evidence.query.includes('from "sessions"') && evidence.query.endsWith('for update');
  }
  assert.equal(blocked,true,`confirmation must wait on its exact session blocker: ${JSON.stringify({targetPid,blockerPid,evidence})}`);now+=1001;
 } finally {await blocker.query('ROLLBACK');blocker.release();observer.release();await outcome;}
 await denied(()=>pending);assert.equal((await row(a.account.id)).providerAccountId,null);
});
