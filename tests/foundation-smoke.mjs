import assert from 'node:assert/strict';

const baseUrl = process.env.PLANLY_BASE_URL?.replace(/\/$/, '');
const email = process.env.PLANLY_OWNER_EMAIL;
const password = process.env.PLANLY_OWNER_PASSWORD;
const phase = process.env.PLANLY_SMOKE_PHASE ?? 'full';
const restartPostId = process.env.PLANLY_RESTART_POST_ID;

if (!baseUrl || !email || !password) {
  throw new Error('PLANLY_BASE_URL, PLANLY_OWNER_EMAIL and PLANLY_OWNER_PASSWORD are required.');
}

function url(path) { return `${baseUrl}${path}`; }
function cookieFrom(response) {
  const header = response.headers.get('set-cookie');
  if (!header) throw new Error('Login did not return a session cookie.');
  return header.split(';', 1)[0];
}
async function json(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}
async function login() {
  const response = await fetch(url('/api/auth/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'planly-foundation-smoke/1' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, 'owner login must succeed');
  return cookieFrom(response);
}
async function api(path, cookie, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('cookie', cookie);
  return fetch(url(path), { ...init, headers });
}

async function seedRestart() {
  const cookie = await login();
  const response = await api('/api/posts', cookie, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseText: `restart-smoke-${Date.now()}`,
      status: 'DRAFT',
      targets: [],
      mediaIds: [],
    }),
  });
  const post = await json(response);
  console.log(JSON.stringify({ restartPostId: post.id }));
}

async function verifyRestart() {
  assert.ok(restartPostId, 'PLANLY_RESTART_POST_ID is required for verify-restart.');
  const cookie = await login();
  const snapshot = await json(await api('/api/bootstrap', cookie));
  assert.ok(snapshot.posts.some(post => post.id === restartPostId), 'seeded draft must survive service restart');
  const deleted = await api(`/api/posts/${encodeURIComponent(restartPostId)}`, cookie, { method: 'DELETE' });
  assert.equal(deleted.status, 204);
  console.log('PASS restart persistence');
}

async function full() {
  const root = await fetch(url('/'), { redirect: 'manual' });
  assert.ok([302, 303, 307, 308].includes(root.status), `unauthenticated / should redirect, got ${root.status}`);
  assert.match(root.headers.get('location') ?? '', /\/login/);

  const unauth = await fetch(url('/api/bootstrap'));
  assert.equal(unauth.status, 401);

  const cookie = await login();
  const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const createResponse = await api('/api/posts', cookie, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseText: 'Foundation smoke draft',
      status: 'DRAFT',
      targets: [
        { provider: 'telegram', textOverride: 'Telegram draft', scheduledAt: null },
        { provider: 'max', textOverride: 'MAX draft', scheduledAt: null },
      ],
      mediaIds: [],
    }),
  });
  const post = await json(createResponse);

  let snapshot = await json(await api('/api/bootstrap', cookie));
  assert.ok(snapshot.posts.some(item => item.id === post.id));

  const updateResponse = await api(`/api/posts/${encodeURIComponent(post.id)}`, cookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseText: 'Foundation smoke scheduled',
      status: 'READY',
      targets: [
        { provider: 'telegram', textOverride: 'Telegram scheduled', scheduledAt },
        { provider: 'max', textOverride: 'MAX scheduled', scheduledAt },
      ],
      mediaIds: [],
    }),
  });
  assert.equal(updateResponse.status, 200);
  snapshot = await json(await api('/api/bootstrap', cookie));
  const edited = snapshot.posts.find(item => item.id === post.id);
  assert.equal(edited?.baseText, 'Foundation smoke scheduled');
  assert.deepEqual(edited?.targets.map(target => [target.provider, target.textOverride]), [
    ['telegram', 'Telegram scheduled'],
    ['max', 'MAX scheduled'],
  ]);

  const invalidForm = new FormData();
  invalidForm.set('file', new File([new TextEncoder().encode('not png')], 'bad.png', { type: 'image/png' }));
  const invalidMedia = await api('/api/media', cookie, { method: 'POST', body: invalidForm });
  assert.equal(invalidMedia.status, 422);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const validForm = new FormData();
  validForm.set('file', new File([png], 'smoke.png', { type: 'image/png' }));
  const mediaCreated = await json(await api('/api/media', cookie, { method: 'POST', body: validForm }));
  const mediaList = await json(await api('/api/media', cookie));
  const uploaded = mediaList.find(item => item.id === mediaCreated.id);
  assert.match(uploaded?.previewUrl ?? '', /^https?:\/\//);
  const preview = await fetch(uploaded.previewUrl);
  assert.equal(preview.status, 200, 'signed preview must be readable outside the web container');
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), png);
  const privateUrl = new URL(uploaded.previewUrl);
  privateUrl.search = '';
  assert.ok([401, 403].includes((await fetch(privateUrl)).status), 'unsigned media must remain private');

  const deletePost = await api(`/api/posts/${encodeURIComponent(post.id)}`, cookie, { method: 'DELETE' });
  assert.equal(deletePost.status, 204);
  const deleteMedia = await api(`/api/media/${encodeURIComponent(mediaCreated.id)}`, cookie, { method: 'DELETE' });
  assert.equal(deleteMedia.status, 204);

  const logout = await api('/api/auth/logout', cookie, { method: 'POST' });
  assert.equal(logout.status, 200);
  const afterLogout = await api('/api/bootstrap', cookie);
  assert.equal(afterLogout.status, 401, 'old session must be invalid after logout');

  console.log('PASS foundation smoke');
}

if (phase === 'seed-restart') await seedRestart();
else if (phase === 'verify-restart') await verifyRestart();
else if (phase === 'full') await full();
else throw new Error(`Unknown PLANLY_SMOKE_PHASE: ${phase}`);
