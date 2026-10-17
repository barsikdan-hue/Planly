import test, {beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {eq, like} from 'drizzle-orm';
import {randomUUID} from 'node:crypto';
import {getDb, closeDb} from '../db/index.ts';
import {users, sessions, socialAccounts, socialBindings, socialConnectionIntents, posts, postTargets} from '../db/schema.ts';
import {ensureOwnerSocialAccounts, listSocialAccounts} from '../lib/server/social-accounts.ts';
import {socialConnectionConfig} from '../lib/server/social-connections/config.ts';
import {sessionTokenHash} from '../lib/server/auth/session.ts';
import {previewSchedulingPlan} from '../lib/server/scheduling-plan-preview.ts';
import {GET as bootstrap} from '../app/api/bootstrap/route.ts';

const db=getDb(), originalFetch=globalThis.fetch;
let calls=0;
beforeEach(async()=>{
 await db.delete(users).where(like(users.id,'e5-%'));
 process.env.TELEGRAM_BOT_TOKEN='123456:TEST_only_never_real_secret';process.env.TELEGRAM_MINI_APP_URL='https://t.me/test_bot';
 process.env.MAX_BOT_TOKEN='MAX_TEST_ONLY_secret';process.env.MAX_MINI_APP_URL='https://max.ru/test_bot';
 calls=0;globalThis.fetch=async()=>{calls++;throw Error('No provider permitted');};
});
after(async()=>{globalThis.fetch=originalFetch;await db.delete(users).where(like(users.id,'e5-%'));await closeDb();});
async function account(provider:'TELEGRAM'|'MAX'='TELEGRAM') {
 const id='e5-user';await db.insert(users).values({id,email:'e5@example.test',displayName:'Private person',authInitialized:true,accessState:'ACTIVE'});
 await ensureOwnerSocialAccounts(id);
 return (await db.select().from(socialAccounts).where(eq(socialAccounts.userId,id))).find(a=>a.provider===provider)!;
}
async function bind(a:Awaited<ReturnType<typeof account>>) {
 await db.update(socialAccounts).set({bindingRevision:1,providerAccountId:'-55555',enabled:false,connectionStatus:'CONNECTED'}).where(eq(socialAccounts.id,a.id));
 await db.insert(socialBindings).values({accountId:a.id,userId:a.userId,provider:a.provider,destinationId:'-55555',humanId:'private-human',botId:'private-bot',configRevision:socialConnectionConfig(a.provider as 'TELEGRAM'|'MAX').revision,sessionVersion:0,revision:1,checkedAt:new Date(0)});
}
async function metadata(id:string){return (await listSocialAccounts('e5-user')).find(a=>a.id===id)!.connection;}
test('USER unverified metadata is server authored and unavailable without setup; legacy VK keeps six fields',async()=>{
 const a=await account();delete process.env.TELEGRAM_MINI_APP_URL;
 const rows=await listSocialAccounts(a.userId),m=rows.find(r=>r.id===a.id)!.connection;
 assert.equal(m?.mode,'verified-user');assert.equal(m?.ready,false);assert.equal(m?.state,'unverified');assert.equal(m?.reason,'SETUP_REQUIRED');assert.deepEqual(m?.actions,[]);
 assert.match(m?.accountHint??'',/^Planly • [a-f0-9]{10}$/);
 assert.deepEqual(Object.keys(rows.find(r=>r.provider==='vk')!).sort(),['connectionStatus','displayName','enabled','id','provider','providerAccountId']);assert.equal(calls,0);
});
for(const provider of ['TELEGRAM','MAX'] as const)test(`${provider} durable verified binding never expires at 30 seconds and private data never leaves projection`,async()=>{
 const a=await account(provider);await bind(a);
 const m=await metadata(a.id);assert.equal(m?.state,'verified-disabled');assert.equal(m?.checkedAt,new Date(0).toISOString());assert.deepEqual(m?.actions,['begin','enable','release']);
 assert.deepEqual(Object.keys(m!).sort(),['accountHint','actions','bindingRevision','checkedAt','mode','ready','reason','state']);
 await db.update(socialAccounts).set({enabled:true}).where(eq(socialAccounts.id,a.id));assert.equal((await metadata(a.id))?.state,'enabled');assert.equal(calls,0);
});
for(const change of ['epoch','config','destination','revision','blocked','error','bot-only'] as const)test(`metadata refuses ${change} as usable without changing account or binding`,async()=>{
 const a=await account();await bind(a);
 await db.update(socialAccounts).set({enabled:true}).where(eq(socialAccounts.id,a.id));
 if(change==='epoch')await db.update(users).set({sessionVersion:1}).where(eq(users.id,a.userId));
 if(change==='blocked')await db.update(users).set({accessState:'BLOCKED'}).where(eq(users.id,a.userId));
 if(change==='config')process.env.TELEGRAM_MINI_APP_URL='https://t.me/other_bot';
 if(change==='destination')await db.update(socialAccounts).set({providerAccountId:'-99999'}).where(eq(socialAccounts.id,a.id));
 if(change==='revision')await db.update(socialAccounts).set({bindingRevision:2}).where(eq(socialAccounts.id,a.id));
 if(change==='error')await db.update(socialAccounts).set({connectionStatus:'ERROR'}).where(eq(socialAccounts.id,a.id));
 if(change==='bot-only')await db.delete(socialBindings).where(eq(socialBindings.accountId,a.id));
 const m=await metadata(a.id);assert.equal(m?.state,change==='bot-only'?'unverified':'stale');assert.ok(!m?.actions.includes('enable'));assert.equal((await db.select().from(socialAccounts).where(eq(socialAccounts.id,a.id)))[0].enabled,true);assert.equal(calls,0);
});
test('configured OWNER projection preserves legacy six fields',async()=>{
 const a=await account();await db.update(users).set({email:process.env.OWNER_EMAIL!,role:'ADMIN'}).where(eq(users.id,a.userId));
 for(const row of await listSocialAccounts(a.userId))assert.equal(Object.keys(row).length,6);assert.equal(calls,0);
});
test('pending projection reveals no candidate human, ticket, session or proof and does not issue claims',async()=>{
 const a=await account();await db.insert(sessions).values({id:'not-exposed',userId:a.userId,tokenHash:'private-session',sessionVersion:0,expiresAt:new Date(Date.now()+60000)});
 await db.insert(socialConnectionIntents).values({id:randomUUID(),userId:a.userId,accountId:a.id,sessionId:'not-exposed',sessionVersion:0,provider:a.provider,destinationId:'-55555',destinationName:'D',generation:0,bindingRevision:0,configRevision:socialConnectionConfig('TELEGRAM').revision,nonceHash:'private-nonce',ticketHash:'private-ticket',humanId:'private-human',state:'CANDIDATE',expiresAt:new Date(Date.now()+60000)});
 const m=await metadata(a.id);assert.equal(m?.state,'pending');assert.ok(!JSON.stringify(m).includes('private-'));assert.equal(calls,0);
 assert.equal((await db.select().from(socialConnectionIntents).where(eq(socialConnectionIntents.accountId,a.id)))[0].state,'CANDIDATE');
});
test('actual bootstrap and scheduling preview carry same safe current USER metadata without provider reads',async()=>{
 const a=await account();await bind(a);const raw='e5-synthetic-session';
 await db.insert(sessions).values({id:randomUUID(),userId:a.userId,tokenHash:sessionTokenHash(raw),sessionVersion:0,expiresAt:new Date(Date.now()+60000)});
 await db.insert(posts).values({id:'e5-post',userId:a.userId,baseText:'private text',status:'DRAFT'});
 await db.insert(postTargets).values({id:'e5-target',postId:'e5-post',socialAccountId:a.id,active:true});
 const response=await bootstrap(new Request('http://localhost/api/bootstrap',{headers:{cookie:`planly_session=${raw}`}}));assert.equal(response.status,200);
 const body=await response.json();const listed=body.socialAccounts.find((r:{id:string})=>r.id===a.id);
 const preview=await previewSchedulingPlan(a.userId,{postIds:['e5-post'],settings:{startDate:'2099-01-01',endDate:'2099-01-03',weekdays:[1,2,3,4,5,6,7],times:['12:00']}});
 assert.equal(listed.connection?.state,'verified-disabled');assert.deepEqual(preview.rows[0].accounts[0].connection,listed.connection);assert.equal(calls,0);
});
