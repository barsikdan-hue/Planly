import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { eq, inArray } from 'drizzle-orm';
import { closeDb, getDb, getPool } from '../db/index.ts';
import { users, sessions, posts, mediaAssets, libraryItems, socialAccounts, postTargets, publications } from '../db/schema.ts';
import { hashOwnerPassword } from '../lib/server/auth/password.ts';
import { authenticateOwner, ensureOwner, requireApiOwner } from '../lib/server/auth/owner.ts';
import { createOwnerSession, getOwnerBySessionToken } from '../lib/server/auth/session.ts';
import { POST as login } from '../app/api/auth/login/route.ts';
import { POST as logout } from '../app/api/auth/logout/route.ts';
import { GET as bootstrap } from '../app/api/bootstrap/route.ts';
import { GET as getPosts, POST as savePost } from '../app/api/posts/route.ts';
import { PATCH as editPost } from '../app/api/posts/[id]/route.ts';
import { DELETE as deleteMedia } from '../app/api/media/[id]/route.ts';
import { DELETE as deleteLibrary } from '../app/api/library-items/[id]/route.ts';
import { PATCH as editAccount } from '../app/api/social-accounts/[id]/route.ts';
import { POST as refreshAnalytics } from '../app/api/analytics/refresh/route.ts';
import { GET as analytics } from '../app/api/analytics/route.ts';
import { POST as previewSchedule } from '../app/api/scheduling-plans/preview/route.ts';
import { processPublication } from '../lib/server/scheduler/processor.ts';
import { closePublicationQueue } from '../lib/server/scheduler/queue.ts';
import { closeRedisConnection } from '../lib/server/scheduler/redis.ts';

const ids = ['p02-admin', 'p02-a', 'p02-b'];
const testDatabase=new URL(process.env.DATABASE_URL!);
assert.ok(['127.0.0.1','localhost'].includes(testDatabase.hostname) && testDatabase.pathname==='/planly_test','Disposable native test database required');
const passwords = ['ci-test-owner-password', 'fixture-A-password', 'fixture-B-password'];
let hashes: string[];
const db = getDb();
function req(path: string, token = '', method = 'GET', body?: unknown, extra: Record<string,string> = {}) {
  return new Request(`http://planly.test${path}`, {method, headers: {cookie:`planly_session=${token}`, 'content-type':'application/json', ...extra}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
}
function context(id: string) { return {params:Promise.resolve({id})}; }
async function loginToken(index: number) {
  const email = index === 0 ? 'owner@example.test' : `p02-${index}@example.test`;
  const response = await login(req('/api/auth/login', '', 'POST', {email, password:passwords[index]}, {'x-forwarded-for':`fixture-${randomUUID()}`}));
  assert.equal(response.status,200, `fixture ${index} must authenticate`);
  assert.match(response.headers.get('set-cookie')!,/HttpOnly/i);
  return response.headers.get('set-cookie')!.match(/planly_session=([^;]+)/)![1];
}
beforeEach(async () => {
  hashes ??= await Promise.all(passwords.map(hashOwnerPassword));
  // This file owns the disposable database fixtures; never used against production.
  await db.delete(users);
  await db.insert(users).values(ids.map((id,i)=>({id,email:i===0?'owner@example.test':`p02-${i}@example.test`,displayName:id,
    ...(i===0?{}:{role:'USER' as const, accessState:'ACTIVE' as const,authInitialized:true,passwordHash:hashes[i]})})));
  await db.insert(posts).values(ids.map(id=>({id:`${id}-post`,userId:id,baseText:`Private ${id}`})));
  await db.insert(mediaAssets).values(ids.map(id=>({id:`${id}-media`,userId:id,storageKey:`${id}/private.png`,originalName:`${id}.png`,mimeType:'image/png',byteSize:3,checksum:'abc'})));
  await db.insert(libraryItems).values(ids.map(id=>({id:`${id}-library`,userId:id,bodyText:`Library ${id}`})));
  await db.insert(socialAccounts).values(ids.map(id=>({id:`${id}-account`,userId:id,provider:'MAX' as const,displayName:id,providerAccountId:`-${id}`,enabled:true,connectionStatus:'CONNECTED' as const})));
});
after(async()=>{await db.delete(users).where(inArray(users.id,ids));await closePublicationQueue();await closeRedisConnection();await closeDb();});

test('real login creates independent ADMIN/A/B sessions and preserves legacy owner id/password/data', async()=>{
  const tokens=await Promise.all(ids.map((_,i)=>loginToken(i)));
  assert.equal(new Set(tokens).size,3);
  for(let i=0;i<3;i++) assert.equal((await getOwnerBySessionToken(tokens[i]))?.id,ids[i]);
  const [owner]=await db.select().from(users).where(eq(users.id,ids[0]));
  assert.equal(owner.role,'ADMIN');assert.equal(owner.accessState,'ACTIVE');assert.equal(owner.passwordHash,null);
  assert.equal((await db.select().from(posts).where(eq(posts.id,`${ids[0]}-post`)))[0].baseText,`Private ${ids[0]}`);
  const [session]=await db.select().from(sessions);assert.ok(!tokens.includes(session.tokenHash));
  assert.equal(await authenticateOwner('p02-1@example.test',passwords[2]),null);
  assert.equal((await authenticateOwner(' P02-1@EXAMPLE.TEST ',passwords[1]))?.id,ids[1]);
});
test('cookie reload restores only its owner; ADMIN has no personal data override or foreign media URLs', async()=>{
  for(let i=0;i<3;i++) {
    const token=await loginToken(i); const response=await bootstrap(req('/api/bootstrap',token));
    assert.equal(response.status,200);assert.match(response.headers.get('cache-control')??'',/no-store/);
    const body=await response.json();assert.equal(body.profile.id,ids[i]);
    assert.deepEqual(body.posts.map((x:{id:string})=>x.id),[`${ids[i]}-post`]);
    assert.deepEqual(body.media.map((x:{id:string})=>x.id),[`${ids[i]}-media`]);
    assert.deepEqual(body.libraryItems.map((x:{id:string})=>x.id),[`${ids[i]}-library`]);
    assert.ok(body.socialAccounts.every((x:{displayName:string})=>!ids.filter(id=>id!==ids[i]).includes(x.displayName)));
    assert.ok(!JSON.stringify(body).includes('passwordHash'));assert.ok(!JSON.stringify(body).includes('fixture-secret'));
    for(const foreign of ids.filter(id=>id!==ids[i]))assert.ok(!new URL(body.media[0].previewUrl).pathname.split('/').includes(foreign));
  }
});
test('A and ADMIN cannot mutate B post/media/library/accounts or attach B media', async()=>{
  for(const i of [0,1]){
    const token=await loginToken(i);const body={baseText:'forged edit',status:'DRAFT',targets:[],mediaIds:[]};
    assert.equal((await editPost(req('/api/posts/p02-b-post',token,'PATCH',body),context('p02-b-post'))).status,404);
    assert.equal((await deleteMedia(req('/api/media/p02-b-media',token,'DELETE'),context('p02-b-media'))).status,404);
    assert.equal((await deleteLibrary(req('/api/library-items/p02-b-library',token,'DELETE'),context('p02-b-library'))).status,404);
    assert.ok([403,404].includes((await editAccount(req('/api/social-accounts/p02-b-account',token,'PATCH',{enabled:false}),context('p02-b-account'))).status));
    assert.equal((await savePost(req('/api/posts',token,'POST',{...body,mediaIds:['p02-b-media']},{'idempotency-key':randomUUID()}))).status,404);
  }
  assert.equal((await db.select().from(posts).where(eq(posts.id,'p02-b-post')))[0].baseText,'Private p02-b');
});
test('forged identity selectors are rejected; own draft mutation still works',async()=>{
  const token=await loginToken(1);const body={baseText:'A draft',status:'DRAFT',targets:[],mediaIds:[]};
  assert.equal((await savePost(req('/api/posts',token,'POST',body,{'idempotency-key':randomUUID()}))).status,201);
  for(const path of ['/api/posts?userId=p02-b','/api/posts?ownerId=p02-b'])assert.equal((await getPosts(req(path,token))).status,403);
  assert.equal((await getPosts(req('/api/posts',token,'GET',undefined,{'x-user-id':'p02-b'}))).status,403);
  assert.equal((await savePost(req('/api/posts',token,'POST',{...body,userId:'p02-b'},{'idempotency-key':randomUUID()}))).status,403);
  assert.equal((await login(req('/api/auth/login','','POST',{email:'p02-1@example.test',password:passwords[1],role:'ADMIN'}))).status,422);
});
test('logout invalidates only supplied session; expired and forged tokens fail closed',async()=>{
  const a=await loginToken(1),b=await loginToken(2);
  assert.equal((await logout(req('/api/auth/logout',a,'POST'))).status,200);
  assert.equal((await getPosts(req('/api/posts',a))).status,401);assert.equal((await getPosts(req('/api/posts',b))).status,200);
  assert.equal((await getPosts(req('/api/posts',`forged-${b}`))).status,401);
  await db.update(sessions).set({expiresAt:new Date(0)}).where(eq(sessions.userId,ids[2]));
  assert.equal((await getPosts(req('/api/posts',b))).status,401);
});
test('blocked accounts deny sessions/login and owner initialization never unblocks an initialized owner',async()=>{
  const tokens=await Promise.all(ids.map((_,i)=>loginToken(i)));
  await db.update(users).set({accessState:'BLOCKED'}).where(inArray(users.id,[ids[0],ids[1]]));
  await ensureOwner();
  for(const i of [0,1]){assert.equal(await getOwnerBySessionToken(tokens[i]),null);assert.equal(await authenticateOwner(i===0?'owner@example.test':'p02-1@example.test',passwords[i]),null);await assert.rejects(createOwnerSession(ids[i]));}
  assert.equal((await getOwnerBySessionToken(tokens[2]))?.id,ids[2]);
});
test('session version revocation rejects stored tokens and stale password verification snapshots',async()=>{
  const token=await loginToken(1);const candidate=await authenticateOwner('p02-1@example.test',passwords[1]);assert.ok(candidate);
  const { revokeUserSessions } = await import('../lib/server/auth/access.ts');
  await revokeUserSessions(ids[1]);assert.equal(await getOwnerBySessionToken(token),null);
  await assert.rejects(createOwnerSession(candidate.id,(candidate as {sessionVersion?:number}).sessionVersion));
  assert.equal((await getOwnerBySessionToken(await loginToken(1)))?.id,ids[1]);
});
test('block/unblock revokes every A token permanently and leaves B active',async()=>{
  const a=await loginToken(1),b=await loginToken(2);
  const {setUserAccessState}=await import('../lib/server/auth/access.ts');
  await setUserAccessState(ids[1],'BLOCKED');assert.equal(await getOwnerBySessionToken(a),null);
  await setUserAccessState(ids[1],'ACTIVE');assert.equal(await getOwnerBySessionToken(a),null);
  assert.equal((await getOwnerBySessionToken(b))?.id,ids[2]);assert.equal((await getOwnerBySessionToken(await loginToken(1)))?.id,ids[1]);
});
test('a second ADMIN uses its own password and has no private-data or owner-credential override',async()=>{
  await db.update(users).set({role:'ADMIN'}).where(eq(users.id,ids[1]));
  const a=await loginToken(1);const snapshot=await (await bootstrap(req('/api/bootstrap',a))).json();
  assert.deepEqual(snapshot.posts.map((p:{id:string})=>p.id),['p02-a-post']);
  assert.equal((await editAccount(req('/api/social-accounts/p02-a-account',a,'PATCH',{enabled:true}),context('p02-a-account'))).status,403);
});
test('a stored pre-migration owner token survives one-time initialization without ID/data reset',async()=>{
  const token=randomUUID();
  await db.insert(sessions).values({id:randomUUID(),userId:ids[0],tokenHash:createHmac('sha256',process.env.SESSION_SECRET!).update(token).digest('hex'),expiresAt:new Date(Date.now()+60000)});
  assert.equal((await getOwnerBySessionToken(token))?.id,ids[0]);assert.equal((await getOwnerBySessionToken(token))?.id,ids[0]);
  assert.equal((await db.select().from(posts).where(eq(posts.id,'p02-admin-post')))[0].baseText,'Private p02-admin');
});
test('session issuance waits on the native user lock and rejects a concurrent revocation commit',async()=>{
  const candidate=await authenticateOwner('p02-1@example.test',passwords[1]);assert.ok(candidate);
  const client=await getPool().connect();let issuing:Promise<{token?:string;error?:unknown}>|undefined;
  try{
    await client.query('BEGIN');await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[ids[1]]);
    const {rows:[{pid}]}=await client.query<{pid:number}>('SELECT pg_backend_pid() AS pid');
    issuing=createOwnerSession(ids[1],candidate.sessionVersion).then(token=>({token}),error=>({error}));
    const deadline=Date.now()+5000;let blocked=false;
    while(Date.now()<deadline){const result=await getPool().query<{blocked:boolean}>('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS blocked',[pid]);blocked=result.rows[0].blocked;if(blocked)break;await delay(20);}
    assert.equal(blocked,true,'session issuance must serialize on the user row');
    await client.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[ids[1]]);await client.query('COMMIT');
    const result=await issuing;assert.ok(result.error);assert.equal(result.token,undefined);
  }finally{await client.query('ROLLBACK');client.release();if(issuing)await issuing;}
});
test('parallel cookie requests and a delayed A response keep captured identities across B login',async()=>{
  const a=await loginToken(1),b=await loginToken(2);
  const captured=await requireApiOwner(req('/api/posts',a));
  const results=await Promise.all(Array.from({length:20},(_,i)=>getPosts(req('/api/posts',i%2?a:b)).then(r=>r.json())));
  for(let i=0;i<20;i++)assert.deepEqual(results[i].map((x:{id:string})=>x.id),[`${i%2?ids[1]:ids[2]}-post`]);
  await loginToken(2);assert.equal(captured.id,ids[1]);
});
test('cross-site login/logout and personal mutations cannot alter a session or data',async()=>{
  const a=await loginToken(1);
  const extra={'origin':'https://evil.test','sec-fetch-site':'cross-site'};
  assert.equal((await login(req('/api/auth/login','','POST',{email:'p02-1@example.test',password:passwords[1]},extra))).status,403);
  assert.equal((await logout(req('/api/auth/logout',a,'POST',undefined,extra))).status,403);
  assert.equal((await editPost(req('/api/posts/p02-a-post',a,'PATCH',{baseText:'attack',status:'DRAFT',targets:[],mediaIds:[]},extra),context('p02-a-post'))).status,403);
  assert.equal((await getOwnerBySessionToken(a))?.id,ids[1]);
});
test('new USER cannot use owner connect/OAuth/analytics credentials and real worker sends zero requests',async()=>{
  const a=await loginToken(1);let calls=0;const original=globalThis.fetch;
  const previousTelegram=process.env.TELEGRAM_BOT_TOKEN,previousMax=process.env.MAX_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN='fixture-owner-telegram-token';process.env.MAX_BOT_TOKEN='fixture-owner-max-token';
  globalThis.fetch=async()=>{calls++;throw Error('provider must not be called');};
  try{
    assert.equal((await editAccount(req('/api/social-accounts/p02-a-account',a,'PATCH',{destinationId:'-123'}),context('p02-a-account'))).status,403);
    assert.equal((await editAccount(req('/api/social-accounts/p02-a-account',a,'PATCH',{enabled:true}),context('p02-a-account'))).status,403);
    assert.equal((await refreshAnalytics(req('/api/analytics/refresh',a,'POST',{provider:'max',period:7},{'X-Planly-Analytics':'1'}))).status,403);
    const {POST:startVk}=await import('../app/api/social-accounts/vk/start/route.ts');
    assert.equal((await startVk(req('/api/social-accounts/vk/start',a,'POST',{accountId:'p02-a-account',communityId:'1'}))).status,403);
    const {GET:callbackVk}=await import('../app/api/social-accounts/vk/callback/route.ts');
    assert.equal((await callbackVk(req('/api/social-accounts/vk/callback?code=forged',a))).status,403);
    await db.update(posts).set({status:'READY'}).where(eq(posts.id,'p02-a-post'));
    await db.insert(postTargets).values({id:'p02-target',postId:'p02-a-post',socialAccountId:'p02-a-account'});
    await db.insert(publications).values({id:'p02-publication',postId:'p02-a-post',postTargetId:'p02-target',userId:ids[1],provider:'MAX',status:'QUEUED',idempotencyKey:randomUUID()});
    const result=await processPublication('p02-publication');assert.equal(result.status,'REQUIRES_RECONNECT');assert.equal(calls,0);
    await db.insert(socialAccounts).values({id:'p02-a-telegram',userId:ids[1],provider:'TELEGRAM',displayName:'A TG',providerAccountId:'-100123',enabled:true,connectionStatus:'CONNECTED'});
    await db.insert(postTargets).values({id:'p02-tg-target',postId:'p02-a-post',socialAccountId:'p02-a-telegram'});
    await db.insert(publications).values({id:'p02-tg-publication',postId:'p02-a-post',postTargetId:'p02-tg-target',userId:ids[1],provider:'TELEGRAM',status:'QUEUED',idempotencyKey:randomUUID()});
    assert.equal((await processPublication('p02-tg-publication')).status,'REQUIRES_RECONNECT');assert.equal(calls,0);
  }finally{globalThis.fetch=original;if(previousTelegram===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=previousTelegram;if(previousMax===undefined)delete process.env.MAX_BOT_TOKEN;else process.env.MAX_BOT_TOKEN=previousMax;}
});
test('analytics and schedule selections cannot read foreign IDs under a valid A session',async()=>{
  const a=await loginToken(1);
  assert.equal((await analytics(req('/api/analytics?provider=max&period=7&accountId=p02-b-account',a))).status,422);
  await db.insert(postTargets).values({id:'p02-b-target',postId:'p02-b-post',socialAccountId:'p02-b-account'});
  await db.insert(publications).values({id:'p02-b-publication',userId:ids[2],postId:'p02-b-post',postTargetId:'p02-b-target',provider:'MAX',status:'PUBLISHED',publishedAt:new Date(),providerRemoteId:'mid.fixtureB',idempotencyKey:randomUUID()});
  const own=await analytics(req('/api/analytics?provider=max&period=7',a));assert.equal(own.status,200);assert.deepEqual((await own.json()).rows,[]);
  const foreign=await analytics(req('/api/analytics?provider=max&period=7',await loginToken(2)));assert.equal(foreign.status,200);assert.equal((await foreign.json()).rows[0].publicationId,'p02-b-publication');
  const result=await previewSchedule(req('/api/scheduling-plans/preview',a,'POST',{postIds:['p02-b-post'],settings:{startDate:'2026-10-15',endDate:'2026-10-16',weekdays:[4,5],times:['12:00']}},{'X-Planly-Scheduling':'1'}));
  assert.equal(result.status,404);
});
