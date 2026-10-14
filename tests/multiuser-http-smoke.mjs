// Real compiled Next HTTP + native database; all enrollment is disposable fixtures.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { inArray, eq } from 'drizzle-orm';
import { getDb, closeDb } from '../db/index.ts';
import { users, posts, mediaAssets, libraryItems, socialAccounts, sessions } from '../db/schema.ts';
import { ensureOwner } from '../lib/server/auth/owner.ts';
import { hashOwnerPassword } from '../lib/server/auth/password.ts';

const database = new URL(process.env.DATABASE_URL || '');
const local = ['127.0.0.1','localhost'].includes(database.hostname) && database.pathname === '/planly_test';
const docker = process.env.PLANLY_MULTIUSER_HTTP_TEST === 'isolated-ci' && database.hostname === 'postgres' && database.pathname === '/planly';
assert.ok(local || docker, 'Only the disposable CI database is allowed');
assert.ok(process.env.OWNER_EMAIL?.endsWith('@example.test'), 'Synthetic owner required');
const base = process.env.PLANLY_MULTIUSER_BASE_URL || 'http://127.0.0.1:4320';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Loopback HTTP only');
process.env.S3_ENDPOINT ||= 'http://127.0.0.1:1';
process.env.S3_REGION ||= 'test-region';process.env.S3_BUCKET ||= 'multiuser-fixtures';
process.env.S3_ACCESS_KEY_ID ||= 'fixture';process.env.S3_SECRET_ACCESS_KEY ||= 'fixture-secret';
const suffix=randomUUID(), ids=[`http-a-${suffix}`,`http-b-${suffix}`];
const passwords=['http-A-password','http-B-password'];
const db=getDb();let server;let serverLog='';const cookies=[];
const api=(path,cookie='',method='GET',body,extra={})=>fetch(`${base}${path}`,{method,redirect:'manual',signal:AbortSignal.timeout(10000),headers:{cookie,'content-type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function login(email,password) {
  const response=await api('/api/auth/login','','POST',{email,password});assert.equal(response.status,200);
  assert.match(response.headers.get('set-cookie')||'',/HttpOnly/i);
  return response.headers.get('set-cookie').split(';')[0];
}
try {
  const owner=await ensureOwner();
  await db.insert(users).values(await Promise.all(ids.map(async(id,i)=>({id,email:`${id}@example.test`,displayName:id,role:'USER',accessState:'ACTIVE',authInitialized:true,passwordHash:await hashOwnerPassword(passwords[i])}))));
  await db.insert(posts).values(ids.map(id=>({id:`${id}-post`,userId:id,baseText:`Private ${id}`})));
  await db.insert(mediaAssets).values(ids.map(id=>({id:`${id}-media`,userId:id,storageKey:`${id}/private.png`,originalName:`${id}.png`,mimeType:'image/png',byteSize:3,checksum:'abc'})));
  await db.insert(libraryItems).values(ids.map(id=>({id:`${id}-library`,userId:id,bodyText:`Library ${id}`})));
  await db.insert(socialAccounts).values(ids.map(id=>({id:`${id}-account`,userId:id,provider:'MAX',displayName:id,enabled:false})));
  if(!process.env.PLANLY_MULTIUSER_BASE_URL) {
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','4320'],{env:{...process.env,NODE_ENV:'production'},stdio:['ignore','pipe','pipe'],windowsHide:true});
    server.stdout.on('data',data=>{serverLog=(serverLog+data).slice(-4000);});server.stderr.on('data',data=>{serverLog=(serverLog+data).slice(-4000);});
    const deadline=Date.now()+30000;let ready=false;
    while(Date.now()<deadline && server.exitCode===null){try{ready=(await api('/api/health')).ok;if(ready)break;}catch{}await delay(200);}
    assert.ok(ready,'Compiled Next server did not start');
  }
  const ownerCookie=await login(process.env.OWNER_EMAIL,process.env.PLANLY_OWNER_PASSWORD || 'ci-test-owner-password');cookies.push(ownerCookie);
  for(let i=0;i<2;i++)cookies.push(await login(`${ids[i]}@example.test`,passwords[i]));
  assert.equal(new Set(cookies).size,3);
  const admin=await api('/api/bootstrap',ownerCookie);assert.equal(admin.status,200);const adminBody=await admin.json();assert.equal(adminBody.profile.id,owner.id);
  assert.ok(!adminBody.posts.some(post=>ids.some(id=>post.id.startsWith(id))));
  for(let i=0;i<2;i++){
    const cookie=cookies[i+1],foreign=ids[1-i];
    for(let reload=0;reload<2;reload++){
      const response=await api('/api/bootstrap',cookie);assert.equal(response.status,200);assert.match(response.headers.get('cache-control')||'',/no-store/);
      const body=await response.json();assert.equal(body.profile.id,ids[i]);assert.deepEqual(body.posts.map(p=>p.id),[`${ids[i]}-post`]);assert.deepEqual(body.media.map(m=>m.id),[`${ids[i]}-media`]);assert.deepEqual(body.libraryItems.map(l=>l.id),[`${ids[i]}-library`]);assert.equal(body.socialAccounts.length,3);assert.ok(body.socialAccounts.every(a=>!a.enabled && a.connectionStatus==='DISCONNECTED'));
      assert.ok(!JSON.stringify(body).includes(foreign));assert.ok(!JSON.stringify(body).includes('passwordHash'));
    }
    assert.equal((await api('/',cookie)).status,200,'SSR session recovery');
    for(const path of ['/api/posts','/api/library-items','/api/media','/api/profile','/api/analytics?provider=max&period=7'])assert.equal((await api(path,cookie)).status,200,path);
    const content={baseText:'HTTP draft',status:'DRAFT',targets:[{provider:'telegram',textOverride:null,scheduledAt:null}],mediaIds:[]};
    assert.equal((await api(`/api/posts/${foreign}-post`,cookie,'PATCH',content)).status,404);
    assert.equal((await api(`/api/library-items/${foreign}-library`,cookie,'DELETE')).status,404);
    assert.equal((await api(`/api/media/${foreign}-media`,cookie,'DELETE')).status,404);
    assert.equal((await api(`/api/posts?userId=${foreign}`,cookie)).status,403);
    assert.equal((await api('/api/posts',cookie,'POST',{...content,userId:foreign},{'idempotency-key':randomUUID()})).status,403);
    assert.equal((await api('/api/posts',cookie,'POST',content,{'idempotency-key':randomUUID()})).status,201);
    assert.equal((await api(`/api/social-accounts/${ids[i]}-account`,cookie,'PATCH',{destinationId:'-123'})).status,403);
    assert.equal((await api('/api/scheduling-plans/preview',cookie,'POST',{postIds:[`${foreign}-post`],settings:{startDate:'2026-10-15',endDate:'2026-10-16',weekdays:[4,5],times:['12:00']}},{'X-Planly-Scheduling':'1'})).status,404);
  }
  const parallel=await Promise.all(Array.from({length:10},(_,i)=>api('/api/profile',cookies[1+i%2]).then(r=>r.json())));
  parallel.forEach((profile,i)=>assert.equal(profile.id,ids[i%2]));
  assert.equal((await api('/api/auth/logout',cookies[1],'POST')).status,200);
  assert.equal((await api('/api/bootstrap',cookies[1])).status,401);assert.equal((await api('/',cookies[1])).status,307);
  assert.equal((await api('/api/profile',cookies[2])).status,200);
  await db.update(sessions).set({expiresAt:new Date(0)}).where(eq(sessions.userId,ids[1]));
  assert.equal((await api('/api/profile',cookies[2])).status,401);
  assert.equal((await api('/api/profile',ownerCookie)).status,200);
  console.log('PASS real compiled HTTP: ADMIN/A/B login, SSR/reload, private APIs/media, foreign/forged IDs, draft writes, concurrent identities, logout/expiry; no provider sends');
} catch(error) {
  // Print only the assertion, never environment/cookies/credentials.
  console.error(error instanceof Error ? error.message : 'HTTP smoke failed');process.exitCode=1;
  if(serverLog.includes('EADDRINUSE'))console.error('Loopback port is already in use');
} finally {
  for(const cookie of cookies)await api('/api/auth/logout',cookie,'POST').catch(()=>{});
  if(server && server.exitCode===null){const exited=once(server,'exit');server.kill();await exited;}
  await db.delete(users).where(inArray(users.id,ids));await closeDb();
}
