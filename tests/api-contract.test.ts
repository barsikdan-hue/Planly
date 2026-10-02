import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb, getDb } from '../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, publications, sessions, socialAccounts, users } from '../db/schema.ts';
import { createOwnerSession, SESSION_COOKIE_NAME } from '../lib/server/auth/session.ts';
import { ensureOwnerSocialAccounts } from '../lib/server/social-accounts.ts';
import { GET as bootstrapGET } from '../app/api/bootstrap/route.ts';
import { POST as postsPOST } from '../app/api/posts/route.ts';
import { PATCH as postPATCH } from '../app/api/posts/[id]/route.ts';

const ownerId = 'api-owner';
let token = '';

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set('cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`);
  return new Request(`http://planly.test${path}`, { ...init, headers });
}

beforeEach(async () => {
  const db = getDb();
  await db.delete(publications);
  await db.delete(postMedia);
  await db.delete(postTargets);
  await db.delete(posts);
  await db.delete(mediaAssets);
  await db.delete(sessions);
  await db.delete(socialAccounts);
  await db.delete(users);
  await db.insert(users).values({ id: ownerId, email: 'owner@example.test', displayName: 'Owner' });
  await ensureOwnerSocialAccounts(ownerId);
  token = await createOwnerSession(ownerId);
});
after(closeDb);

test('bootstrap rejects unauthenticated requests and returns owner snapshot when authenticated', async () => {
  token = '';
  const unauthorized = await bootstrapGET(request('/api/bootstrap'));
  assert.equal(unauthorized.status, 401);
  token = await createOwnerSession(ownerId);
  const response = await bootstrapGET(request('/api/bootstrap'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.profile.email, 'owner@example.test');
  assert.deepEqual(body.posts, []);
  assert.deepEqual(body.media, []);
  assert.deepEqual(body.socialAccounts.map((x: { provider: string }) => x.provider).sort(), ['max', 'telegram']);
});

test('posts endpoint distinguishes malformed JSON, invalid input and valid creation', async () => {
  const malformed = await postsPOST(request('/api/posts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad',
  }));
  assert.equal(malformed.status, 400);

  const invalid = await postsPOST(request('/api/posts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseText: '', status: 'DRAFT', targets: [], mediaIds: [] }),
  }));
  assert.equal(invalid.status, 422);

  const valid = await postsPOST(request('/api/posts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseText: 'hello', status: 'DRAFT', targets: [], mediaIds: [] }),
  }));
  assert.equal(valid.status, 201);
  const body = await valid.json();
  assert.equal(body.baseText, 'hello');
  assert.equal(body.status, 'DRAFT');
});

test('unknown post is 404 and response does not expose stack or database internals', async () => {
  const response = await postPATCH(
    request('/api/posts/missing', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseText: 'x', status: 'DRAFT', targets: [], mediaIds: [] }),
    }),
    { params: Promise.resolve({ id: 'missing' }) },
  );
  assert.equal(response.status, 404);
  const text = await response.text();
  assert.doesNotMatch(text, /stack|postgres|select |update /i);
});

test('Telegram connection verifies channel posting permissions before exposing CONNECTED', async () => {
  const { PATCH } = await import('../app/api/social-accounts/[id]/route.ts');
  const { createServer } = await import('node:http');
  const { listSocialAccounts } = await import('../lib/server/social-accounts.ts');
  const tokenValue = '123456:abcdefghijklmnopqrstuvwxyz123456789';
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  let permitted = false;
  const server = createServer((req,res) => {
    const method = req.url!.split('/').at(-1)!;
    methods.push(method);
    req.resume();
    const result = method === 'getMe' ? {id:123456,is_bot:true} : method === 'getChat' ? {id:-100123,type:'channel',title:'Test'} : {user:{id:123456},status:'administrator',can_post_messages:permitted};
    res.setHeader('content-type','application/json'); res.end(JSON.stringify({ok:true,result}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const addr=server.address(); assert.ok(addr && typeof addr !== 'string');
  globalThis.fetch=(url,init)=>originalFetch(`http://127.0.0.1:${addr.port}${new URL(String(url)).pathname}`,init);
  process.env.TELEGRAM_BOT_TOKEN=tokenValue;
  try {
    const account=(await listSocialAccounts(ownerId)).find(a=>a.provider==='telegram')!;
    const connect=()=>PATCH(request(`/api/social-accounts/${account.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({destinationId:'@planly_test'})}),{params:Promise.resolve({id:account.id})});
    const rejected=await connect(); assert.equal(rejected.status,422);
    assert.equal((await listSocialAccounts(ownerId)).find(a=>a.id===account.id)?.connectionStatus,'DISCONNECTED');
    permitted=true;
    const response=await connect(); assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.connectionStatus,'CONNECTED'); assert.equal(body.providerAccountId,'-100123'); assert.equal(body.enabled,true);
    assert.ok(!JSON.stringify(body).includes(tokenValue));
    assert.deepEqual(methods,['getMe','getChat','getChatMember','getMe','getChat','getChatMember']);
    const foreign=await PATCH(request('/api/social-accounts/not-owned',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({destinationId:'@planly_test'})}),{params:Promise.resolve({id:'not-owned'})});
    assert.equal(foreign.status,404); assert.equal(methods.length,6);
  } finally {globalThis.fetch=originalFetch;delete process.env.TELEGRAM_BOT_TOKEN;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
