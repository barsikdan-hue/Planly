import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import { eq } from 'drizzle-orm';
import { closeDb, getDb, getPool } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { createOwnerSession, getOwnerBySessionToken } from '../lib/server/auth/session.ts';
import { POST as login } from '../app/api/auth/login/route.ts';
import { POST as logout } from '../app/api/auth/logout/route.ts';
import { GET as getPosts } from '../app/api/posts/route.ts';
import { revokeUserSessions, setUserAccessState } from '../lib/server/auth/access.ts';

const db = getDb();
const database = new URL(process.env.DATABASE_URL!);
assert.ok(['localhost', '127.0.0.1'].includes(database.hostname) && database.pathname === '/planly_test', 'Isolated test database required');
const ids = ['invite-admin', 'invite-a', 'invite-b'];
const password = 'Invitation-test-password';
let adminToken: string;
let aToken: string;
let admin: typeof import('../app/api/admin/invitations/route.ts');
let inspect: typeof import('../app/api/auth/invitations/inspect/route.ts');
let accept: typeof import('../app/api/auth/invitations/accept/route.ts');
let revoke: typeof import('../app/api/admin/invitations/[id]/route.ts');
function request(path: string, token = '', method = 'POST', body?: unknown, headers: Record<string,string> = {}) {
  return new Request(`http://planly.test${path}`, {method, headers: {'content-type':'application/json', cookie:`planly_session=${token}`, 'x-forwarded-for':randomUUID(), ...headers}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
}
async function create(email = `${randomUUID()}@example.test`) {
  const response = await admin.POST(request('/api/admin/invitations', adminToken, 'POST', {email}));
  assert.equal(response.status, 201);
  return response.json();
}
async function activate(token: string, extra = {}) { return accept.POST(request('/api/auth/invitations/accept', '', 'POST', {token,password,...extra})); }
function cookie(response: Response) {
  const match=response.headers.get('set-cookie')?.match(/planly_session=([^;]+)/);
  assert.ok(Boolean(match),'Expected an authenticated session cookie');
  return match![1];
}
beforeEach(async () => {
  admin ??= await import('../app/api/admin/invitations/route.ts');
  inspect ??= await import('../app/api/auth/invitations/inspect/route.ts');
  accept ??= await import('../app/api/auth/invitations/accept/route.ts');
  revoke ??= await import('../app/api/admin/invitations/[id]/route.ts');
  await db.delete(schema.users);
  await db.delete(schema.loginRateLimits);
  await db.insert(schema.users).values(ids.map((id, index) => ({id,email:index === 0?'owner@example.test':`${id}@example.test`,displayName:id,role:index===0?'ADMIN' as const:'USER' as const,accessState:'ACTIVE' as const,authInitialized:true,passwordHash:null})));
  adminToken = await createOwnerSession(ids[0]); aToken = await createOwnerSession(ids[1]);
});
after(async () => { await db.delete(schema.users); await closeDb(); });

test('ADMIN invitation creates one USER and a real recoverable session without changing the owner', async () => {
  const ownerBefore = (await db.select().from(schema.users).where(eq(schema.users.id,ids[0])))[0];
  const invite = await create(' Colleague@Example.test ');
  assert.equal(invite.email,'colleague@example.test'); assert.ok(typeof invite.token==='string' && /^[A-Za-z0-9_-]{43}$/.test(invite.token),'Invitation token must contain 32 random bytes encoded as base64url');
  const inspection = await inspect.POST(request('/api/auth/invitations/inspect','', 'POST',{token:invite.token}));
  assert.equal(inspection.status,200); assert.equal((await inspection.json()).email,invite.email);
  const result = await activate(invite.token); assert.equal(result.status,200); assert.ok(/HttpOnly/.test(result.headers.get('set-cookie')??''),'Authenticated session cookie must be HttpOnly');
  const user = await getOwnerBySessionToken(cookie(result)); assert.equal(user?.email,invite.email);
  const [row] = await db.select().from(schema.users).where(eq(schema.users.email,invite.email));
  assert.equal(row.role,'USER'); assert.equal(row.accessState,'ACTIVE'); assert.equal(row.authInitialized,true); assert.ok(/^scrypt\$/.test(row.passwordHash??''),'Account password must use the existing scrypt format');
  assert.deepEqual(await db.select().from(schema.socialAccounts).where(eq(schema.socialAccounts.userId,row.id)),[]);
  assert.ok(isDeepStrictEqual((await db.select().from(schema.users).where(eq(schema.users.id,ids[0])))[0],ownerBefore),'Invitation acceptance must preserve the entire owner record');
  assert.equal((await getOwnerBySessionToken(adminToken))?.id,ids[0]);
  const signedIn = await login(request('/api/auth/login','', 'POST',{email:invite.email,password})); assert.equal(signedIn.status,200);
  assert.equal((await getOwnerBySessionToken(cookie(signedIn)))?.id,row.id);
  assert.equal((await logout(request('/api/auth/logout',cookie(result)))).status,200);
  assert.equal(await getOwnerBySessionToken(cookie(result)),null);
});

test('USER, unauthenticated and blocked ADMIN cannot list/create/revoke invitations; identity overrides fail', async () => {
  const invitation = await create();
  for(const token of ['',aToken]) {
    for(const [method, body] of [['GET',undefined],['POST',{email:'denied@example.test'}]] as const) assert.equal((await admin[method](request('/api/admin/invitations',token,method,body))).status,token?403:401);
    assert.equal((await revoke.DELETE(request(`/api/admin/invitations/${invitation.id}`,token,'DELETE'),{params:Promise.resolve({id:invitation.id})})).status,token?403:401);
    assert.equal((await admin.POST(request('/api/admin/invitations',token,'POST',{email:'invalid'}))).status,token?403:401);
  }
  for(const body of [{email:'forge@example.test',role:'ADMIN'},{email:'forge@example.test',userId:ids[1]}]) assert.equal((await admin.POST(request('/api/admin/invitations',adminToken,'POST',body))).status,403);
  assert.equal((await admin.GET(request('/api/admin/invitations?userId=invite-b',adminToken,'GET'))).status,403);
  await setUserAccessState(ids[0],'BLOCKED'); assert.equal((await admin.GET(request('/api/admin/invitations',adminToken,'GET'))).status,401);
});

test('invitation tokens are hashed and never exposed by lists or errors', async () => {
  const invite = await create();
  const result = await getPool().query('select * from user_invitations where id=$1',[invite.id]);
  assert.ok(result.rows[0].token_hash===createHash('sha256').update(invite.token).digest('hex'),'Stored invitation digest must exactly match SHA256 of the issued token');
  assert.ok(!JSON.stringify(result.rows).includes(invite.token));
  const response = await admin.GET(request('/api/admin/invitations',adminToken,'GET')); assert.equal(response.status,200);
  const text = await response.text(); assert.ok(!text.includes(invite.token)); assert.ok(!text.includes('tokenHash')); assert.ok(!text.includes('token_hash'));
  const invalid = await activate(`${invite.token}x`); assert.equal(invalid.status,422); assert.ok(!(await invalid.text()).includes(invite.token));
});

test('expired, revoked and replayed invitations reject without a second user or session', async () => {
  const expired = await create(); await getPool().query('update user_invitations set expires_at=now()-interval \'1 second\' where id=$1',[expired.id]);
  const revoked = await create(); assert.equal((await revoke.DELETE(request(`/api/admin/invitations/${revoked.id}`,adminToken,'DELETE'),{params:Promise.resolve({id:revoked.id})})).status,200);
  for(const invite of [expired,revoked]) { assert.equal((await activate(invite.token)).status,410); assert.equal((await inspect.POST(request('/api/auth/invitations/inspect','', 'POST',{token:invite.token}))).status,410); }
  const used = await create(); assert.equal((await activate(used.token)).status,200); assert.equal((await activate(used.token)).status,410);
  const [count] = (await getPool().query('select count(*)::int count from users where email=$1',[used.email])).rows; assert.equal(count.count,1);
  const listing = await (await admin.GET(request('/api/admin/invitations',adminToken,'GET'))).json(); assert.deepEqual(new Set(listing.invitations.map((x:{status:string})=>x.status)),new Set(['EXPIRED','REVOKED','ACCEPTED']));
});

test('parallel activation consumes one invitation atomically and issues exactly one session', async () => {
  const invite = await create(); const responses = await Promise.all(Array.from({length:8},()=>activate(invite.token)));
  assert.equal(responses.filter(x=>x.status===200).length,1); assert.equal(responses.filter(x=>x.status===410).length,7);
  const rows = (await getPool().query('select u.id, (select count(*)::int from sessions s where s.user_id=u.id) sessions from users u where email=$1',[invite.email])).rows;
  assert.equal(rows.length,1); assert.equal(rows[0].sessions,1);
});

test('duplicate existing or pending email cannot alter owner, blocked users, or create parallel invites', async () => {
  await setUserAccessState(ids[2],'BLOCKED');
  for(const email of ['owner@example.test','INVITE-B@EXAMPLE.TEST']) assert.equal((await admin.POST(request('/api/admin/invitations',adminToken,'POST',{email}))).status,409);
  const email = 'parallel@example.test'; const results = await Promise.all(Array.from({length:5},()=>admin.POST(request('/api/admin/invitations',adminToken,'POST',{email}))));
  assert.equal(results.filter(x=>x.status===201).length,1); assert.equal(results.filter(x=>x.status===409).length,4);
});

test('expiry replacement and delayed activation use the same lock order and recheck expiry after admission', async () => {
  const invite=await create('lock-order@example.test');
  await getPool().query("update user_invitations set expires_at=now()+interval '2 seconds' where id=$1",[invite.id]);
  const blocker=await getPool().connect();
  await blocker.query('select pg_advisory_lock(hashtextextended($1,1))',[invite.email]);
  let replacement:Promise<Response>|undefined,activation:Promise<Response>|undefined;
  try {
    replacement=admin.POST(request('/api/admin/invitations',adminToken,'POST',{email:invite.email}));
    async function waitForWaiters(count:number) {
      const deadline=Date.now()+5000;
      while(Date.now()<deadline) {
        const result=await getPool().query("select count(*)::int count from pg_stat_activity where datname=current_database() and wait_event='advisory' and query like '%pg_advisory_xact_lock%'");
        if(result.rows[0].count>=count)return;
        await delay(10);
      }
      assert.fail('Invitation requests did not reach their email lock');
    }
    await waitForWaiters(1);
    activation=activate(invite.token);
    await waitForWaiters(2);
    await delay(2100);
    await blocker.query('select pg_advisory_unlock(hashtextextended($1,1))',[invite.email]);
    assert.equal((await replacement).status,201);
    assert.equal((await activation).status,410);
    assert.equal((await getPool().query('select count(*)::int count from users where email=$1',[invite.email])).rows[0].count,0);
  } finally {
    await blocker.query('select pg_advisory_unlock_all()');blocker.release();
    await Promise.allSettled([replacement,activation].filter(Boolean));
  }
});

test('a failed session insert rolls back account creation and invitation consumption', async () => {
  const invite=await create('rollback@example.test');
  await getPool().query("create function invite_fixture_fail_session() returns trigger language plpgsql as $$ begin raise exception 'fixture session insert failure'; end $$");
  await getPool().query('create trigger invite_fixture_session_failure before insert on sessions for each row execute function invite_fixture_fail_session()');
  try {
    assert.equal((await activate(invite.token)).status,500);
    assert.equal((await getPool().query('select count(*)::int count from users where email=$1',[invite.email])).rows[0].count,0);
    assert.equal((await getPool().query('select status from user_invitations where id=$1',[invite.id])).rows[0].status,'PENDING');
  } finally {
    await getPool().query('drop trigger invite_fixture_session_failure on sessions');
    await getPool().query('drop function invite_fixture_fail_session()');
  }
  assert.equal((await activate(invite.token)).status,200);
});

test('password and forged acceptance payload validation leave invitation usable', async () => {
  const invite = await create();
  for(const bad of ['', 'short', 'x'.repeat(129)]) assert.equal((await accept.POST(request('/api/auth/invitations/accept','', 'POST',{token:invite.token,password:bad}))).status,422);
  for(const extra of [{role:'ADMIN'},{userId:ids[0]},{email:'owner@example.test'}]) assert.ok([403,422].includes((await activate(invite.token,extra)).status));
  assert.equal((await activate(invite.token)).status,200);
});

test('cross-origin requests are rejected and public invitation rate consumption is atomic', async () => {
  const invite = await create();
  assert.equal((await activate(invite.token)).status,200);
  for(const site of ['cross-site','same-site','none']) assert.equal((await inspect.POST(request('/api/auth/invitations/inspect','', 'POST',{token:invite.token},{'sec-fetch-site':site}))).status,403);
  assert.equal((await admin.POST(request('/api/admin/invitations',adminToken,'POST',{email:'csrf@example.test'},{origin:'http://attacker.test'}))).status,403);
  assert.equal((await accept.POST(request('/api/auth/invitations/accept','', 'POST',{token:invite.token,password},{origin:'http://attacker.test'}))).status,403);
  const requests = await Promise.all(Array.from({length:25},()=>inspect.POST(request('/api/auth/invitations/inspect','', 'POST',{token:'x'.repeat(43)},{'x-forwarded-for':'invite-limited'}))));
  assert.equal(requests.filter(x=>x.status===410).length,20); assert.equal(requests.filter(x=>x.status===429).length,5);
  assert.ok(requests.filter(x=>x.status===429).every(x=>Number(x.headers.get('retry-after'))>0));
});

test('a shared token budget rejects inspection and KDF activation despite changing caller IP headers', async () => {
  const invite=await create();
  const responses=await Promise.all(Array.from({length:25},()=>inspect.POST(request('/api/auth/invitations/inspect','','POST',{token:invite.token}))));
  assert.equal(responses.filter(response=>response.status===200).length,20);
  assert.equal(responses.filter(response=>response.status===429).length,5);
  const denied=await activate(invite.token);assert.equal(denied.status,429);
  assert.ok(Number(denied.headers.get('retry-after'))>0);
  assert.equal((await getPool().query('select count(*)::int count from users where email=$1',[invite.email])).rows[0].count,0);
  const budgets=await db.select().from(schema.loginRateLimits);
  assert.ok(!JSON.stringify(budgets).includes(invite.token));
  const other=await create();assert.equal((await activate(other.token)).status,200);
  await db.update(schema.loginRateLimits).set({windowStartedAt:new Date(Date.now()-16*60*1000)});
  assert.equal((await activate(invite.token)).status,200);
});

test('row-locked revoke and activation serialize without reviving a revoked invitation', async () => {
  async function waitForInvitationWaiters(count:number) {
    const deadline=Date.now()+5000;
    while(Date.now()<deadline) {
      const result=await getPool().query("select count(*)::int count from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%user_invitations%'");
      if(result.rows[0].count>=count)return;
      await delay(10);
    }
    assert.fail('Invitation requests did not reach their consume lock');
  }
  for(const first of ['revoke','accept']) {
    const invite=await create();const blocker=await getPool().connect();
    await blocker.query('begin');await blocker.query('select id from user_invitations where id=$1 for update',[invite.id]);
    const runRevoke=()=>revoke.DELETE(request(`/api/admin/invitations/${invite.id}`,adminToken,'DELETE'),{params:Promise.resolve({id:invite.id})});
    const promises:Promise<Response>[]=[];
    try {
      promises.push(first==='revoke'?runRevoke():activate(invite.token));
      await waitForInvitationWaiters(1);
      promises.push(first==='revoke'?activate(invite.token):runRevoke());
      await waitForInvitationWaiters(2);
      await blocker.query('commit');
      const responses=await Promise.all(promises);
      assert.deepEqual(responses.map(response=>response.status),first==='revoke'?[200,410]:[200,200]);
      const row=(await getPool().query('select status from user_invitations where id=$1',[invite.id])).rows[0];assert.equal(row.status,first==='revoke'?'REVOKED':'ACCEPTED');
      assert.equal((await getPool().query('select count(*)::int count from users where email=$1',[invite.email])).rows[0].count,first==='revoke'?0:1);
    } finally { await blocker.query('rollback');blocker.release();await Promise.allSettled(promises); }
  }
});

test('blocked and revoked ADMIN sessions cannot create or revoke invitations', async () => {
  for(const mode of ['blocked','revoked']) {
    const invite=await create();
    if(mode==='blocked')await setUserAccessState(ids[0],'BLOCKED');else await revokeUserSessions(ids[0]);
    assert.equal((await admin.POST(request('/api/admin/invitations',adminToken,'POST',{email:'stale-admin@example.test'}))).status,401);
    assert.equal((await revoke.DELETE(request(`/api/admin/invitations/${invite.id}`,adminToken,'DELETE'),{params:Promise.resolve({id:invite.id})})).status,401);
    assert.equal((await getPool().query('select status from user_invitations where id=$1',[invite.id])).rows[0].status,'PENDING');
    await setUserAccessState(ids[0],'ACTIVE');adminToken=await createOwnerSession(ids[0]);
  }
});

test('accepted A/B and ADMIN sessions see only their own posts and cannot forge owner identity', async () => {
  const invites = await Promise.all(['new-a@example.test','new-b@example.test'].map(create));
  const tokens = await Promise.all(invites.map(async x=>cookie(await activate(x.token))));
  const people = await Promise.all(tokens.map(getOwnerBySessionToken));
  await db.insert(schema.posts).values([{id:'owner-private',userId:ids[0],baseText:'Owner private'},...people.map((x,i)=>({id:`invited-${i}`,userId:x!.id,baseText:`Private ${i}`}))]);
  for(let i=0;i<tokens.length;i++) { const response = await getPosts(request('/api/posts',tokens[i],'GET')); assert.deepEqual((await response.json()).map((x:{id:string})=>x.id),[`invited-${i}`]); assert.equal((await getPosts(request('/api/posts?userId=invite-admin',tokens[i],'GET'))).status,403); }
  assert.deepEqual((await (await getPosts(request('/api/posts',adminToken,'GET'))).json()).map((x:{id:string})=>x.id),['owner-private']);
});
