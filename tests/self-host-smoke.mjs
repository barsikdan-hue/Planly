// Destructive Redis-loss probe for a fresh, disposable CI Compose stack only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

assert.equal(process.env.PLANLY_SELF_HOST_TEST, 'isolated-ci', 'Run this only against an empty disposable CI stack.');
const base = process.env.PLANLY_BASE_URL;
assert.equal(new URL(base).hostname, 'localhost');
const compose = (...args) => execFileSync('docker', ['compose', '--env-file', '.env.self-host', ...args], {
  encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'],
});
const smoke = phase => execFileSync(process.execPath, ['tests/foundation-smoke.mjs'], {
  env: { ...process.env, PLANLY_SMOKE_PHASE: phase }, encoding: 'utf8', timeout: 60000,
});
console.log(smoke('full').trim());

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.PLANLY_OWNER_EMAIL, password: process.env.PLANLY_OWNER_PASSWORD }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';', 1)[0];
async function api(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('cookie', cookie);
  return fetch(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(10000) });
}
const libraryInput = { title: null, text: 'isolated durable Library intent', mediaIds: [] };
const libraryKey = crypto.randomUUID(), deletedLibraryKey = crypto.randomUUID();
const createLibrary = key => api('/api/library-items', { method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(libraryInput) });
const libraryResponse = await createLibrary(libraryKey);
assert.equal(libraryResponse.status, 201);
const libraryItem = await libraryResponse.json();
const libraryReplay = await createLibrary(libraryKey);
assert.equal(libraryReplay.status, 201); assert.equal((await libraryReplay.json()).id, libraryItem.id);
const terminalResponse = await createLibrary(deletedLibraryKey);
assert.equal(terminalResponse.status, 201);
const terminalItem = await terminalResponse.json();
assert.equal((await api(`/api/library-items/${terminalItem.id}`, { method: 'DELETE' })).status, 204);
const terminalReplay = await createLibrary(deletedLibraryKey);
assert.equal(terminalReplay.status, 410); assert.equal((await terminalReplay.json()).code, 'LIBRARY_CREATION_RESULT_DELETED');
console.log('PASS keyed Library replay and terminal history before restart');
async function waitFor(check, message, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(message);
}
async function schedule(delay) {
  const response = await api('/api/posts', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseText: 'isolated scheduler runtime smoke', status: 'READY', mediaIds: [],
      targets: [{ provider: 'telegram', textOverride: null, scheduledAt: new Date(Date.now() + delay).toISOString() }] }),
  });
  assert.equal(response.status, 201);
  return response.json();
}
function publication(postId) {
  const code = `import { eq } from 'drizzle-orm';
    import { getDb, closeDb } from './db/index.ts';
    import { publications } from './db/schema.ts';
    const rows = await getDb().select().from(publications).where(eq(publications.postId, ${JSON.stringify(postId)}));
    console.log(JSON.stringify(rows[0])); await closeDb();`;
  return JSON.parse(compose('exec', '-T', 'worker', 'node', '--experimental-strip-types', '--input-type=module', '-e', code));
}

const future = await schedule(300000);
const before = publication(future.id);
assert.equal(before.status, 'SCHEDULED');
assert.equal(before.attemptCount, 0);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const form = new FormData();
form.set('file', new File([png], 'restart.png', { type: 'image/png' }));
const upload = await api('/api/media', { method: 'POST', body: form });
assert.equal(upload.status, 201);
const media = await upload.json();

function workerMediaBytes(mediaId) {
  const code = `import { eq } from 'drizzle-orm';
    import { getDb, closeDb } from './db/index.ts';
    import { mediaAssets } from './db/schema.ts';
    import { readMediaObjectBytes } from './lib/server/storage.ts';
    const [asset] = await getDb().select().from(mediaAssets).where(eq(mediaAssets.id, ${JSON.stringify(mediaId)}));
    console.log(Buffer.from(await readMediaObjectBytes(asset.storageKey, asset.byteSize)).toString('base64'));
    await closeDb();`;
  return Buffer.from(compose('exec', '-T', 'worker', 'node', '--experimental-strip-types', '--input-type=module', '-e', code).trim(), 'base64');
}
assert.deepEqual(workerMediaBytes(media.id), png, 'worker must read the actual private media bytes before provider handoff');
console.log('PASS actual worker reads private object bytes');

compose('stop', 'worker');
assert.equal(compose('exec', '-T', 'redis', 'redis-cli', 'FLUSHDB').trim(), 'OK');
compose('down'); // Named volumes intentionally preserved.
compose('up', '-d', '--wait', '--wait-timeout', '120');
await waitFor(async () => (await fetch(`${base}/api/health`)).ok, 'web did not recover');

const snapshot = await (await api('/api/bootstrap')).json();
const restartedLibrary = await createLibrary(libraryKey);
assert.equal(restartedLibrary.status, 201); assert.equal((await restartedLibrary.json()).id, libraryItem.id);
assert.equal(snapshot.libraryItems.filter(item => item.id === libraryItem.id).length, 1);
const restartedTerminal = await createLibrary(deletedLibraryKey);
assert.equal(restartedTerminal.status, 410); assert.equal((await restartedTerminal.json()).code, 'LIBRARY_CREATION_RESULT_DELETED');
assert.equal(snapshot.libraryItems.some(item => item.id === terminalItem.id), false);
console.log('PASS Library intent mapping and terminal history survive full stack recreation');
assert.ok(snapshot.posts.some(post => post.id === future.id), 'schedule must survive full stack recreation');
const restoredMedia = snapshot.media.find(item => item.id === media.id);
assert.ok(restoredMedia, 'media metadata must survive');
assert.deepEqual(workerMediaBytes(media.id), png, 'worker private media access must survive stack recreation');
assert.deepEqual(Buffer.from(await (await fetch(restoredMedia.previewUrl)).arrayBuffer()), png, 'media bytes must survive');
const recovered = publication(future.id);
assert.equal(recovered.id, before.id);
assert.equal(recovered.attemptCount, 0, 'restart must not publish future jobs early');
assert.equal(compose('exec', '-T', 'redis', 'redis-cli', 'EXISTS', `bull:planly-publications:${recovered.id}`).trim(), '1', 'startup reconciliation must restore missing Redis job');
console.log('PASS stack recreation, PostgreSQL/media persistence and Redis-loss reconciliation');

const due = await schedule(2000);
await waitFor(async () => publication(due.id)?.status === 'FAILED', 'worker did not process the due job');
const processed = publication(due.id);
assert.equal(processed.providerErrorCode, 'PROVIDER_NOT_IMPLEMENTED');
assert.equal(processed.attemptCount, 1);
assert.equal(processed.providerRemoteId, null, 'unimplemented provider cannot claim publication success');
assert.match(compose('logs', '--no-color', 'worker'), /Planly publication worker started/);
console.log('PASS real worker runtime and honest unsupported-provider result');

for (const id of [future.id, due.id]) assert.equal((await api(`/api/posts/${id}`, { method: 'DELETE' })).status, 204);
assert.equal((await api(`/api/library-items/${libraryItem.id}`, { method: 'DELETE' })).status, 204);
assert.equal((await api(`/api/media/${media.id}`, { method: 'DELETE' })).status, 204);
