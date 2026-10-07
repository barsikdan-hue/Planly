import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb, getDb } from '../db/index.ts';
import { libraryItems, libraryItemMedia, mediaAssets, postMedia, posts, postTargets, publications, sessions, socialAccounts, users } from '../db/schema.ts';
import { createOwnerSession, SESSION_COOKIE_NAME } from '../lib/server/auth/session.ts';
import { ensureOwnerSocialAccounts } from '../lib/server/social-accounts.ts';
import { GET as bootstrapGET } from '../app/api/bootstrap/route.ts';
import { POST as postsPOST } from '../app/api/posts/route.ts';
import { PATCH as postPATCH } from '../app/api/posts/[id]/route.ts';
import { GET as postGET } from '../app/api/posts/route.ts';
import { eq } from 'drizzle-orm';
import { closePublicationQueue } from '../lib/server/scheduler/queue.ts';
import { closeRedisConnection } from '../lib/server/scheduler/redis.ts';
import { DELETE as mediaDELETE } from '../app/api/media/[id]/route.ts';

const ownerId = 'api-owner';
let token = '';

// Routes may resolve storage even when rejecting an attached asset. Keep this
// test-owned fixture local so CI needs no production storage configuration.
const storageEnvKeys = ['S3_ENDPOINT', 'S3_PUBLIC_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
const originalStorageEnv = Object.fromEntries(storageEnvKeys.map(key => [key, process.env[key]]));
Object.assign(process.env, {
  S3_ENDPOINT: 'http://127.0.0.1:1',
  S3_REGION: 'test-region',
  S3_BUCKET: 'api-contract-test',
  S3_ACCESS_KEY_ID: 'test-access',
  S3_SECRET_ACCESS_KEY: 'test-secret',
});
delete process.env.S3_PUBLIC_ENDPOINT;

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
  await db.delete(libraryItems);
  await db.delete(mediaAssets);
  await db.delete(sessions);
  await db.delete(socialAccounts);
  await db.delete(users);
  await db.insert(users).values({ id: ownerId, email: 'owner@example.test', displayName: 'Owner' });
  await ensureOwnerSocialAccounts(ownerId);
  token = await createOwnerSession(ownerId);
});
after(async () => {
  await closePublicationQueue();
  await closeRedisConnection();
  await closeDb();
  for (const key of storageEnvKeys) {
    if (originalStorageEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalStorageEnv[key];
  }
});

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
  assert.deepEqual(body.libraryItems, []);
  assert.deepEqual(body.media, []);
  assert.deepEqual(body.socialAccounts.map((x: { provider: string }) => x.provider).sort(), ['max', 'telegram', 'vk']);
});

async function libraryRoutes() {
  const collection = await import('../app/api/library-items/route.ts').catch(() => null);
  const item = await import('../app/api/library-items/[id]/route.ts').catch(() => null);
  assert.ok(collection && item, 'Owner Library API routes must be available');
  return { collection, item };
}

test('Library API authenticates collection and item routes before processing content', async () => {
  const { collection, item } = await libraryRoutes();
  token = '';
  assert.equal((await collection.GET(request('/api/library-items'))).status, 401);
  assert.equal((await collection.POST(request('/api/library-items', { method: 'POST', body: '{bad' }))).status, 401);
  assert.equal((await item.PATCH(request('/api/library-items/missing', { method: 'PATCH', body: '{bad' }), { params: Promise.resolve({ id: 'missing' }) })).status, 401);
  assert.equal((await item.DELETE(request('/api/library-items/missing', { method: 'DELETE' }), { params: Promise.resolve({ id: 'missing' }) })).status, 401);
});

test('Library API uses JSON 400, validation 422, READY creation, full replacement and 204 deletion', async () => {
  const { collection, item } = await libraryRoutes();
  const post = (body: unknown) => collection.POST(request('/api/library-items', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) }));
  const malformed = await collection.POST(request('/api/library-items', { method: 'POST', body: '{bad' }));
  assert.equal(malformed.status, 400);
  for (const input of [
    { text: '  ', mediaIds: [] },
    { text: 'copy', mediaIds: ['same', 'same'] },
    { text: 'copy', mediaIds: Array.from({ length: 21 }, (_, i) => `media-${i}`) },
    { title: 'x'.repeat(201), text: 'copy', mediaIds: [] },
    { text: 'x'.repeat(20_001), mediaIds: [] },
  ]) assert.equal((await post(input)).status, 422);
  const createdResponse = await post({ title: '  title  ', text: ' copy ', mediaIds: [], status: 'USED' });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.status, 'READY');
  assert.equal(created.text, 'copy');
  assert.equal(created.sourcePostId, null);
  const patch = (body: unknown) => item.PATCH(request(`/api/library-items/${created.id}`, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: created.id }) });
  for (const input of [
    { text: 'invalid', mediaIds: [], status: 'USED' },
    { text: 'invalid', status: 'READY' },
    { mediaIds: [], status: 'READY' },
    { text: '', mediaIds: [], status: 'READY' },
  ]) assert.equal((await patch(input)).status, 422);
  const updatedResponse = await patch({ text: 'edited', mediaIds: [], status: 'ARCHIVED' });
  assert.equal(updatedResponse.status, 200);
  const updated = await updatedResponse.json();
  assert.equal(updated.title, null);
  assert.equal(updated.status, 'ARCHIVED');
  assert.equal(updated.text, 'edited');
  assert.deepEqual(await (await collection.GET(request('/api/library-items'))).json(), [updated]);
  assert.deepEqual((await (await bootstrapGET(request('/api/bootstrap'))).json()).libraryItems, [updated]);
  const deleted = await item.DELETE(request(`/api/library-items/${created.id}`, { method: 'DELETE' }), { params: Promise.resolve({ id: created.id }) });
  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), '');
  assert.deepEqual(await (await collection.GET(request('/api/library-items'))).json(), []);
});

test('Library API foreign and missing items and media return safe indistinguishable 404', async () => {
  const { collection, item } = await libraryRoutes();
  const db = getDb();
  await db.insert(users).values({ id: 'library-other-owner', email: 'library-other@example.test', displayName: 'Other' });
  await db.insert(libraryItems).values({ id: 'foreign-library', userId: 'library-other-owner', bodyText: 'private' });
  await db.insert(mediaAssets).values({ id: 'foreign-library-media', userId: 'library-other-owner', storageKey: 'library-other/media', originalName: 'private.png', mimeType: 'image/png', byteSize: 24, checksum: 'private' });
  for (const id of ['foreign-library', 'missing-library']) {
    const context = { params: Promise.resolve({ id }) };
    const updated = await item.PATCH(request(`/api/library-items/${id}`, { method: 'PATCH', body: JSON.stringify({ text: 'attack', mediaIds: [], status: 'READY' }) }), context);
    const deleted = await item.DELETE(request(`/api/library-items/${id}`, { method: 'DELETE' }), context);
    for (const response of [updated, deleted]) {
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: 'Not found' });
    }
  }
  for (const mediaId of ['foreign-library-media', 'missing-library-media']) {
    const response = await collection.POST(request('/api/library-items', { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ text: '', mediaIds: [mediaId] }) }));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Not found' });
  }
  assert.deepEqual(await (await collection.GET(request('/api/library-items'))).json(), []);
});

test('Library API exposes USED source Post in list and bootstrap and keeps USED on edit', async () => {
  const { collection, item } = await libraryRoutes();
  const db = getDb();
  await db.insert(libraryItems).values({ id: 'used-library-api', userId: ownerId, bodyText: 'used original', status: 'USED' });
  await db.insert(posts).values({ id: 'library-source-api', userId: ownerId, baseText: 'Post copy', sourceLibraryItemId: 'used-library-api' });
  const response = await item.PATCH(request('/api/library-items/used-library-api', { method: 'PATCH', body: JSON.stringify({ text: 'Library edit', mediaIds: [], status: 'READY' }) }), { params: Promise.resolve({ id: 'used-library-api' }) });
  assert.equal(response.status, 200);
  const updated = await response.json();
  assert.equal(updated.status, 'USED');
  assert.equal(updated.sourcePostId, 'library-source-api');
  assert.equal(updated.text, 'Library edit');
  assert.deepEqual(await (await collection.GET(request('/api/library-items'))).json(), [updated]);
  assert.deepEqual((await (await bootstrapGET(request('/api/bootstrap'))).json()).libraryItems, [updated]);
  const [post] = await db.select().from(posts);
  assert.equal(post.baseText, 'Post copy');
});

test('Media DELETE protects Library-only and Post references with safe 409 and owner 404', async () => {
  const db = getDb();
  await db.insert(mediaAssets).values({ id: 'attached-api-media', userId: ownerId, storageKey: 'owner/library.png', originalName: 'library.png', mimeType: 'image/png', byteSize: 24, checksum: 'library' });
  await db.insert(libraryItems).values({ id: 'attached-api-library', userId: ownerId, bodyText: 'copy' });
  await db.insert(libraryItemMedia).values({ libraryItemId: 'attached-api-library', mediaId: 'attached-api-media', position: 0 });
  const remove = (id: string) => mediaDELETE(request(`/api/media/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });
  const libraryOnly = await remove('attached-api-media');
  assert.equal(libraryOnly.status, 409);
  const safeBody = await libraryOnly.json();
  assert.doesNotMatch(JSON.stringify(safeBody), /attached-api|owner\/|postgres|select |stack/i);
  await db.delete(libraryItemMedia);
  await db.insert(posts).values({ id: 'attached-api-post', userId: ownerId, baseText: 'post' });
  await db.insert(postMedia).values({ postId: 'attached-api-post', mediaId: 'attached-api-media', position: 0 });
  const postAttached = await remove('attached-api-media');
  assert.equal(postAttached.status, 409);
  assert.deepEqual(await postAttached.json(), safeBody);
  await db.insert(users).values({ id: 'media-other-api', email: 'media-other-api@example.test', displayName: 'Other' });
  await db.insert(mediaAssets).values({ id: 'foreign-delete-api', userId: 'media-other-api', storageKey: 'other/media.png', originalName: 'media.png', mimeType: 'image/png', byteSize: 24, checksum: 'other' });
  for (const id of ['foreign-delete-api', 'missing-delete-api']) {
    const response = await remove(id);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Not found' });
  }
  assert.equal((await db.select().from(mediaAssets)).length, 2);
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

test('owner API saves captionless media, preserves it after reload and schedules independent targets', async () => {
  await getDb().insert(mediaAssets).values({
    id: 'api-photo', userId: ownerId, storageKey: 'owner/photo.png', originalName: 'photo.png',
    mimeType: 'image/png', byteSize: 24, checksum: 'test-photo',
  });
  const input = { baseText: '', status: 'DRAFT', targets: [], mediaIds: ['api-photo'] };
  const create = await postsPOST(request('/api/posts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  }));
  assert.equal(create.status, 201);
  const created = await create.json();
  const ready = { ...input, status: 'READY', targets: ['telegram', 'max'].map(provider => ({
    provider, textOverride: null, scheduledAt: '2030-01-01T09:00:00.000Z',
  })) };
  const update = await postPATCH(request(`/api/posts/${created.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ready),
  }), { params: Promise.resolve({ id: created.id }) });
  assert.equal(update.status, 200);
  const snapshot = await (await postGET(request('/api/posts'))).json();
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].baseText, '');
  assert.deepEqual(snapshot[0].mediaIds, ['api-photo']);
  assert.deepEqual(snapshot[0].targets.map((t: { provider: string }) => t.provider), ['telegram', 'max']);
  const queued = await getDb().select().from(publications).where(eq(publications.postId, created.id));
  assert.deepEqual(queued.map(p => p.provider).sort(), ['MAX', 'TELEGRAM']);
  assert.ok(queued.every(p => p.status === 'SCHEDULED'));
  const removeLast = await postPATCH(request(`/api/posts/${created.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, mediaIds: [] }),
  }), { params: Promise.resolve({ id: created.id }) });
  assert.equal(removeLast.status, 422);
  assert.deepEqual((await (await postGET(request('/api/posts'))).json())[0].mediaIds, ['api-photo']);
});

test('captionless media cannot bypass ownership or refer to missing assets', async () => {
  await getDb().insert(users).values({ id: 'other-api-owner', email: 'other@example.test', displayName: 'Other' });
  await getDb().insert(mediaAssets).values({
    id: 'foreign-api-photo', userId: 'other-api-owner', storageKey: 'other/photo.png', originalName: 'photo.png',
    mimeType: 'image/png', byteSize: 24, checksum: 'foreign-photo',
  });
  for (const id of ['foreign-api-photo', 'missing-photo']) {
    const response = await postsPOST(request('/api/posts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseText: '', status: 'DRAFT', targets: [], mediaIds: [id] }),
    }));
    assert.equal(response.status, 404);
  }
  assert.deepEqual(await (await postGET(request('/api/posts'))).json(), []);
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
