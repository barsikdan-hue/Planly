import test, {beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac, randomUUID} from 'node:crypto';
import {eq, like} from 'drizzle-orm';
import {getDb, closeDb} from '../db/index.ts';
import * as schema from '../db/schema.ts';
import {ensureOwnerSocialAccounts, listSocialAccounts} from '../lib/server/social-accounts.ts';
import {sessionTokenHash, SESSION_COOKIE_NAME, deleteSessionByToken} from '../lib/server/auth/session.ts';
import {setUserAccessState} from '../lib/server/auth/access.ts';

import * as startRoute from '../app/api/social-connections/accounts/[id]/start/route.ts';
import * as proofRoute from '../app/api/social-connections/providers/[provider]/proof/route.ts';
import * as previewRoute from '../app/api/social-connections/preview/route.ts';
import * as confirmRoute from '../app/api/social-connections/confirm/route.ts';
import * as http from '../lib/server/social-connections/http.ts';
import * as finishRoute from '../app/social-connections/finish/route.ts';
import * as miniRoute from '../app/social-connections/miniapp/[provider]/route.ts';
const origin='https://planly.example.test',token='123456:TEST_only_never_real_secret';
let calls=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 calls++; const u=new URL(String(input));
 if(u.hostname==='api.telegram.org') {
  const b=JSON.parse(String(init?.body??'{}'));
  if(u.pathname===`/bot${token}/getMe`)return Response.json({ok:true,result:{id:123456,is_bot:true}});
  if(u.pathname===`/bot${token}/getChat`)return Response.json({ok:true,result:{id:Number(b.chat_id),type:'channel',title:'D fixture'}});
  if(u.pathname===`/bot${token}/getChatMember`)return Response.json({ok:true,result:{user:{id:b.user_id,is_bot:b.user_id===123456},status:'administrator',can_post_messages:true}});
 }
 if(u.hostname==='platform-api2.max.ru') {
  if(u.pathname==='/me')return Response.json({user_id:7,is_bot:true});
  if(u.pathname==='/chats/-66666')return Response.json({chat_id:-66666,type:'channel',status:'active',title:'D fixture'});
  if(u.pathname==='/chats/-66666/members/me')return Response.json({user_id:7,is_bot:true,is_owner:false,is_admin:true,permissions:['write']});
  if(u.pathname==='/chats/-66666/members')return Response.json({members:[{user_id:42,is_bot:false,is_owner:false,is_admin:true,permissions:['write']}]});
 }
 throw new Error('Forbidden fake transport operation');
};
async function actor(name:string,provider='TELEGRAM') {
 const id=`e3-${name}`,raw=randomUUID(),db=getDb();
 await db.insert(schema.users).values({id,email:`${id}@example.test`,displayName:'Private Planly name',authInitialized:true,accessState:'ACTIVE'});
 await db.insert(schema.sessions).values({id:randomUUID(),userId:id,tokenHash:sessionTokenHash(raw),sessionVersion:0,expiresAt:new Date(Date.now()+86400000)});
 await ensureOwnerSocialAccounts(id);
 return {id,raw,account:(await db.select().from(schema.socialAccounts).where(eq(schema.socialAccounts.userId,id))).find(a=>a.provider===provider)!};
}
function req(body:unknown,raw='',headers:Record<string,string>={},path='/api/social-connections/preview') {
 return new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','X-Planly-Social-Connection':'1',cookie:`${SESSION_COOKIE_NAME}=${raw}`,...headers},body:JSON.stringify(body)});
}
function signed(launch:string,provider:string) {
 const data={auth_date:String(Math.floor(Date.now()/1000)),start_param:new URL(launch).searchParams.get('startapp')!,user:JSON.stringify({id:42,is_bot:false,first_name:'Ada'})};
 const canonical=Object.entries(data).sort(([a],[b])=>a<b?-1:1).map(([k,v])=>`${k}=${v}`).join('\n');
 const key=createHmac('sha256','WebAppData').update(provider==='MAX'?'MAX_TEST_ONLY_secret':token).digest();
 return new URLSearchParams({...data,hash:createHmac('sha256',key).update(canonical).digest('hex')}).toString();
}
async function start(a:Awaited<ReturnType<typeof actor>>) {
 assert.ok(startRoute,'strict connection start route must exist');
 return startRoute.POST(req({destinationId:a.account.provider==='MAX'?'-66666':'-12345'},a.raw),{params:Promise.resolve({id:a.account.id})});
}
async function candidate(a:Awaited<ReturnType<typeof actor>>) {
 assert.ok(proofRoute,'cookie-independent proof route must exist');
 const s=await start(a);assert.equal(s.status,200);const started=await s.json();
 const r=await proofRoute.POST(req({initData:signed(started.launchUrl,a.account.provider)},'invalid-cookie'),{params:Promise.resolve({provider:a.account.provider.toLowerCase()})});
 assert.equal(r.status,200);const proof=await r.json();assert.equal(proof.accountHint,started.accountHint);assert.match(proof.accountHint,/^Lentaro • [a-f0-9]{10}$/);return proof;
}
beforeEach(async()=>{
 await getDb().delete(schema.users).where(like(schema.users.id,'e3-%'));await getDb().delete(schema.socialProofRateLimits);calls=0;
 process.env.TELEGRAM_BOT_TOKEN=token;process.env.TELEGRAM_MINI_APP_URL='https://t.me/test_bot';process.env.MAX_BOT_TOKEN='MAX_TEST_ONLY_secret';process.env.MAX_MINI_APP_URL='https://max.ru/test_bot';delete process.env.PLANLY_PUBLIC_ORIGIN;
});
after(async()=>{globalThis.fetch=originalFetch;await getDb().delete(schema.users).where(like(schema.users.id,'e3-%'));await getDb().delete(schema.socialProofRateLimits);await closeDb();});

for(const provider of ['TELEGRAM','MAX'])test(`${provider} native HTTP proof preserves disabled binding and exact-session explicit confirmation`,async()=>{
 assert.ok(previewRoute);assert.ok(confirmRoute);
 const a=await actor('flow',provider),p=await candidate(a);
 assert.equal('planlyName' in p,false);assert.equal('accountId' in p,false);assert.equal(JSON.stringify(p).includes('Private Planly name'),false);
 const second=randomUUID();await getDb().insert(schema.sessions).values({id:randomUUID(),userId:a.id,tokenHash:sessionTokenHash(second),sessionVersion:0,expiresAt:new Date(Date.now()+60000)});
 for(const route of [previewRoute,confirmRoute]) {
  const r=await route.POST(req({ticket:p.ticket},second));assert.equal(r.status,403);assert.equal(JSON.stringify(await r.json()).includes('42'),false);
 }
 for(let i=0;i<2;i++){const r=await previewRoute.POST(req({ticket:p.ticket},a.raw));assert.equal(r.status,200);const body=await r.json();assert.equal(body.humanId,'42');assert.equal(body.planlyName,'Private Planly name');}
 assert.equal((await getDb().select().from(schema.socialBindings)).length,0);
 const confirmed=await confirmRoute.POST(req({ticket:p.ticket},a.raw));assert.equal(confirmed.status,200);const receipt=await confirmed.json();assert.equal(receipt.state,'VERIFIED_DISABLED');
 const n=calls;assert.deepEqual(await (await confirmRoute.POST(req({ticket:p.ticket},a.raw))).json(),receipt);assert.equal(calls,n);
 const account=(await getDb().select().from(schema.socialAccounts).where(eq(schema.socialAccounts.id,a.account.id)))[0];assert.equal(account.enabled,false);
 const listing=JSON.stringify(await listSocialAccounts(a.id));for(const secret of [p.ticket,'humanId','ticketHash','sessionId'])assert.equal(listing.includes(secret),false);
});
test('auth precedes body reading; strict CSRF rejects absent/conflicting metadata',async()=>{
 assert.ok(previewRoute);assert.ok(confirmRoute);assert.ok(startRoute);
 const a=await actor('auth');
 for(const route of [previewRoute,confirmRoute,startRoute]) {
  const r=req({});Object.defineProperty(r,'body',{get(){throw new Error('body must not be touched');}});
  assert.equal((await route.POST(r,{params:Promise.resolve({id:a.account.id})})).status,401);
  const invalidHeaders:Record<string,string>[]=[{origin:''},{origin:'https://evil.test'},{'X-Planly-Social-Connection':''},{'content-type':'text/plain'},{'content-type':'application/x-www-form-urlencoded'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'},{origin:'https://evil.test','sec-fetch-site':'same-origin'}];
  for(const headers of invalidHeaders) {
   const response=await route.POST(req({},a.raw,headers),{params:Promise.resolve({id:a.account.id})});assert.equal(response.status,403);assert.equal(response.headers.get('cache-control'),'private, no-store');
  }
 }
 assert.equal(calls,0);
});
test('strict payloads selectors types utf8 and streaming limits are rejected without sensitive diagnostics',async()=>{
 assert.ok(previewRoute);assert.ok(proofRoute);const a=await actor('bounds');
 for(const body of [{ticket:'a'.repeat(43),userId:a.id},{ticket:'a'.repeat(44)},{ticket:42},{operationId:'x'},null,[]])assert.equal((await previewRoute.POST(req(body,a.raw))).status,422);
 for(const path of ['/api/social-connections/preview?humanId=42','/api/social-connections/preview?ticket=x'])assert.equal((await previewRoute.POST(req({ticket:'a'.repeat(43)},a.raw,{},path))).status,403);
 for(const name of ['x-user-id','x-owner-id','x-human-id','x-session-id','x-account-id','x-session-token','x-planly-human-id','authorization']) {
  const response=await previewRoute.POST(req({ticket:'a'.repeat(43)},a.raw,{[name]:'private'}));assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'Forbidden'});
 }
 for(const body of ['{',new Uint8Array([123,34,255,34,125])]) {
  const r=new Request(origin,{method:'POST',headers:req({},a.raw).headers,body});assert.equal((await previewRoute.POST(r)).status,400);
 }
 const large=new Request(origin,{method:'POST',headers:req({},a.raw).headers,body:JSON.stringify({ticket:'x'.repeat(100000)})});assert.equal((await previewRoute.POST(large)).status,413);
 for(const provider of ['vk','TELEGRAM','unknown'])assert.equal((await proofRoute.POST(req({initData:'x'}),{params:Promise.resolve({provider})})).status,422);
 for(const body of [{initData:'x',humanId:'42'},{initData:'x'.repeat(16385)}])assert.equal((await proofRoute.POST(req(body),{params:Promise.resolve({provider:'telegram'})})).status,422);
 assert.equal(calls,0);
});
test('foreign accounts missing setup and invalid tickets fail closed',async()=>{
 assert.ok(startRoute);assert.ok(previewRoute);const a=await actor('own'),b=await actor('other');
 assert.equal((await startRoute.POST(req({destinationId:'-12345'},b.raw),{params:Promise.resolve({id:a.account.id})})).status,403);
 assert.equal((await previewRoute.POST(req({ticket:'a'.repeat(43)},a.raw))).status,403);
 delete process.env.TELEGRAM_MINI_APP_URL;assert.equal((await start(a)).status,503);assert.equal(calls,0);
});
for(const reason of ['logout','blocked','expired'])test(`HTTP ${reason} denies original ticket`,async()=>{
 assert.ok(confirmRoute);const a=await actor(reason),p=await candidate(a);
 if(reason==='logout')await deleteSessionByToken(a.raw);
 if(reason==='blocked')await setUserAccessState(a.id,'BLOCKED');
 if(reason==='expired')await getDb().update(schema.sessions).set({expiresAt:new Date(0)}).where(eq(schema.sessions.userId,a.id));
 assert.equal((await confirmRoute.POST(req({ticket:p.ticket},a.raw))).status,401);assert.equal((await getDb().select().from(schema.socialBindings)).length,0);
});
test('unexpected driver errors are generic 500 without logging their sensitive contents',async()=>{
 assert.ok(http);const messages:unknown[]=[];const old=console.error;console.error=(...args)=>{messages.push(args);};
 try{for(const error of [new Error('SQL private session credential'),new TypeError('provider private token')]) {
  const response=http.socialConnectionApiError(error);assert.equal(response.status,500);assert.deepEqual(await response.json(),{error:'Connection temporarily unavailable'});
 }}finally{console.error=old;}
 assert.deepEqual(messages,[]);
});
test('configured reverse proxy origin is exact and invalid settings fail closed',async()=>{
 assert.ok(previewRoute);const a=await actor('proxy');process.env.PLANLY_PUBLIC_ORIGIN=origin;
 const headers:Record<string,string>={...Object.fromEntries(req({},a.raw).headers),'sec-fetch-site':'same-origin',host:'evil.test','x-forwarded-host':'evil.test'};
 const make=()=>new Request('http://internal:3000/api/social-connections/preview',{method:'POST',headers,body:JSON.stringify({ticket:'a'.repeat(43)})});
 let response=await previewRoute.POST(make());assert.equal(response.status,403);assert.equal((await response.json()).code,'DENIED');
 headers.origin='https://evil.test';response=await previewRoute.POST(make());assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'Forbidden'});
 for(const value of ['http://planly.example.test',origin+'/',origin+'/path',origin+'?x=1','https://name:password@planly.example.test','']) {
  process.env.PLANLY_PUBLIC_ORIGIN=value;headers.origin=origin;response=await previewRoute.POST(make());assert.equal(response.status,503);
 }
 assert.equal(calls,0);
});
test('proof ingress has strict same-origin envelope even without any Planly session',async()=>{
 assert.ok(proofRoute);const ctx={params:Promise.resolve({provider:'telegram'})};
 const invalidHeaders:Record<string,string>[]=[{origin:''},{origin:'https://evil.test'},{'X-Planly-Social-Connection':''},{'sec-fetch-site':'cross-site'},{'content-type':'text/plain'},{'x-human-id':'42'}];
 for(const headers of invalidHeaders)assert.equal((await proofRoute.POST(req({initData:'x'},'',headers),ctx)).status,403);
 const escaped='{"initData":"'+String.raw`\u0061`.repeat(16384)+'"}';
 assert.equal((await proofRoute.POST(new Request(origin,{method:'POST',headers:req({}).headers,body:escaped}),ctx)).status,403);
 const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('{"initData":"'));controller.enqueue(new Uint8Array(100000));controller.close();}});
 const response=await proofRoute.POST(new Request(origin,{method:'POST',headers:req({}).headers,body:stream,duplex:'half'} as RequestInit),ctx);assert.equal(response.status,413);
 assert.equal(calls,0);
});
test('raw GET documents do not create candidates, authenticate, bootstrap, or read providers',async()=>{
 assert.ok(finishRoute);assert.ok(miniRoute);const a=await actor('get'),s=await start(a);assert.equal(s.status,200);calls=0;
 const before=await getDb().select().from(schema.socialConnectionIntents);
 assert.equal((await finishRoute.GET()).status,200);
 for(const provider of ['telegram','max']) {
  const response=await miniRoute.GET(new Request(origin+'/social-connections/miniapp/'+provider+'?ticket=discarded'),{params:Promise.resolve({provider})});assert.equal(response.status,200);assert.equal((await response.text()).includes('discarded'),false);
 }
 assert.deepEqual(await getDb().select().from(schema.socialConnectionIntents),before);assert.equal(calls,0);assert.equal((await getDb().select().from(schema.socialBindings)).length,0);
});
