// Compiled Next HTTP and real sessions; disposable data and private storage only.
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { asc, eq, inArray } from 'drizzle-orm';
import { getDb, closeDb } from '../db/index.ts';
import { users, posts, postTargets, publications, mediaAssets, libraryItems, libraryItemMedia } from '../db/schema.ts';
import { hashOwnerPassword } from '../lib/server/auth/password.ts';
import { createS3Storage } from '../lib/server/storage.ts';

const hash = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

// Small S3 protocol fixture: unsigned/incorrectly signed requests never read bytes.
async function privateStorage() {
  const objects = new Map();
  const config = { S3_REGION: 'fixture-region', S3_BUCKET: 'shared-fixtures', S3_ACCESS_KEY_ID: 'isolated-fixture', S3_SECRET_ACCESS_KEY: randomUUID() };
  const server = createServer(async (request, response) => {
    try {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const bytes = Buffer.concat(chunks), url = new URL(request.url, `http://${request.headers.host}`);
      const presigned = url.searchParams.has('X-Amz-Signature');
      const authorization = request.headers.authorization || '';
      const credential = presigned ? url.searchParams.get('X-Amz-Credential') : /Credential=([^,]+)/.exec(authorization)?.[1];
      const [access, date, region, service, ending] = (credential || '').split('/');
      const stamp = presigned ? url.searchParams.get('X-Amz-Date') : request.headers['x-amz-date'];
      let query = '', canonicalHeaders, payloadHash;
      if (presigned) {
        query = [...url.searchParams].filter(([key]) => key !== 'X-Amz-Signature').map(([key, value]) => [encode(key), encode(value)]).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&');
        canonicalHeaders = `host:${url.host}\n`; payloadHash = 'UNSIGNED-PAYLOAD';
      } else {
        payloadHash = request.headers['x-amz-content-sha256'];
        canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${stamp}\n`;
      }
      const signedHeaders = presigned ? 'host' : 'host;x-amz-content-sha256;x-amz-date';
      const canonical = [request.method, url.pathname, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
      const scope = `${date}/${region}/s3/aws4_request`;
      const key = hmac(hmac(hmac(hmac(`AWS4${config.S3_SECRET_ACCESS_KEY}`, date || ''), region || ''), 's3'), 'aws4_request');
      const expected = createHmac('sha256', key).update(`AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${hash(canonical)}`).digest('hex');
      const signature = presigned ? url.searchParams.get('X-Amz-Signature') : /Signature=([a-f0-9]+)/.exec(authorization)?.[1];
      if (access !== config.S3_ACCESS_KEY_ID || region !== config.S3_REGION || service !== 's3' || ending !== 'aws4_request' || expected !== signature || (!presigned && hash(bytes) !== payloadHash)) { response.writeHead(403).end(); return; }
      if (request.method === 'PUT') { objects.set(url.pathname, { bytes, type: request.headers['content-type'] }); response.writeHead(200).end(); }
      else if (request.method === 'DELETE') { objects.delete(url.pathname); response.writeHead(204).end(); }
      else if (request.method === 'GET' && objects.has(url.pathname)) { const object = objects.get(url.pathname); response.writeHead(200, { 'content-type': object.type, 'content-length': object.bytes.length }).end(object.bytes); }
      else response.writeHead(404).end();
    } catch { response.writeHead(500).end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  return { config: { ...config, S3_ENDPOINT: endpoint, S3_PUBLIC_ENDPOINT: endpoint }, stop: () => new Promise(resolve => server.close(resolve)) };
}

/** @param {{cleanupPhase?: <T>(label: string, work: () => Promise<T>) => Promise<T>}} [options] */
export async function startSharedLibraryRuntime(options = {}) {
  const phase = options.cleanupPhase ?? ((_label, work) => work());
  const database = new URL(process.env.DATABASE_URL || '');
  const local = ['127.0.0.1', 'localhost'].includes(database.hostname) && database.pathname === '/planly_test';
  const docker = process.env.PLANLY_SHARED_LIBRARY_HTTP_TEST === 'isolated-ci' && database.hostname === 'postgres' && database.pathname === '/planly';
  assert.ok(local || docker, 'Disposable database required');
  assert.ok(process.env.OWNER_EMAIL?.endsWith('@example.test'), 'Synthetic owner required');
  const external = process.env.PLANLY_MULTIUSER_BASE_URL;
  assert.ok(!external || ['127.0.0.1', 'localhost'].includes(new URL(external).hostname), 'Loopback HTTP required');
  let storageFixture, server;
  const config = external ? {
    S3_ENDPOINT: process.env.S3_ENDPOINT, S3_PUBLIC_ENDPOINT: process.env.S3_PUBLIC_ENDPOINT,
    S3_REGION: process.env.S3_REGION, S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  } : (storageFixture = await privateStorage()).config;
  // Explicitly override both endpoints: inherited public storage is never used locally.
  const storage = createS3Storage(config);
  let backend = external;
  if (!backend) {
    const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
    const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
    backend = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, ...config, NODE_ENV: 'production' }, stdio: 'ignore', windowsHide: true });
    const deadline = Date.now() + 30000; let ready = false;
    while (Date.now() < deadline && server.exitCode === null) { try { ready = (await fetch(`${backend}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {} if (ready) break; await delay(100); }
    if (!ready) { if (server.exitCode === null) server.kill(); await storageFixture.stop(); throw new Error('Compiled shared-library server startup failed'); }
  }
  const suffix = randomUUID(), ids = ['admin', 'a', 'b'].map(name => `shared-http-${name}-${suffix}`);
  const password = 'shared-library-isolated-password', db = getDb(), cookies = [], keys = new Set();
  const sources = Array.from({ length: 4 }, () => randomUUID()), privateIds = [randomUUID(), randomUUID()];
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAAkUlEQVR4nOzQAQkAIQAAMXk+lI3sDwYwgV6BLcL+ufbg7hs8CQqCgqAgKAgKgoKgICgICoKCoCAoCAqCgqAgKAgKgoKgICgICoKCoCAoCAqCgqAgKAgKgoKgICgICoKCoCAoCAqCgqAgKAgKgoKgICgICoKCoCAoCAqCgqAgKAgKgoKgICgICoKCoCAoCAqCwgEAAP//e6tslwAAAAZJREFUAwDxmgIWvt7wWQAAAABJRU5ErkJggg==', 'base64');
  // Existing synthetic swipe-video.webm bytes, embedded for the piped Docker smoke.
  const video = Buffer.from('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', 'base64');
  const media = [{ id: `${ids[0]}-video`, name: 'first.webm', mimeType: 'video/webm', bytes: video }, { id: `${ids[0]}-image`, name: 'second.png', mimeType: 'image/png', bytes: image }];
  /** @param {unknown} [body] */
  const api = (path, cookie = '', method = 'GET', body = undefined, extra = {}) => fetch(`${backend}${path}`, { method, redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { cookie, 'content-type': 'application/json', 'x-forwarded-for': `shared-${suffix}`, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const login = async id => {
    const response = await api('/api/auth/login', '', 'POST', { email: `${id}@example.test`, password });
    assert.equal(response.status, 200, 'Real session login');
    const header = response.headers.get('set-cookie') || ''; assert.match(header, /HttpOnly/i); assert.match(header, /SameSite=Lax/i);
    const cookie = header.split(';')[0]; cookies.push(cookie); return cookie;
  };
  const cleanup = async () => {
    for (const cookie of cookies) await phase('shared.logout', async () => { await api('/api/auth/logout', cookie, 'POST').catch(() => {}); });
    if (server?.exitCode === null) await phase('shared.next.exit', async () => { const exited = once(server, 'exit'); server.kill(); await exited; });
    const assets = await phase('shared.pg.media', async () => await db.select().from(mediaAssets).where(inArray(mediaAssets.userId, ids)));
    for (const asset of assets) keys.add(asset.storageKey);
    await phase('shared.pg.users.delete', async () => { await db.delete(users).where(inArray(users.id, ids)); });
    await phase('shared.pg.users.absent', async () => { assert.equal((await db.select({ id: users.id }).from(users).where(inArray(users.id, ids))).length, 0, 'Owned fixture users must be removed before the next catalog scenario'); });
    for (const key of keys) await phase('shared.s3.delete', () => storage.delete(key));
    if (storageFixture) await phase('shared.storage.close', () => storageFixture.stop());
    await phase('shared.pg.close', closeDb);
  };
  try {
    await db.insert(users).values(await Promise.all(ids.map(async (id, index) => ({ id, email: `${id}@example.test`, displayName: `Shared fixture ${index}`, role: index === 0 ? 'ADMIN' : 'USER', accessState: 'ACTIVE', authInitialized: true, passwordHash: await hashOwnerPassword(password) }))));
    await db.insert(libraryItems).values(sources.map((id, index) => ({ id, userId: ids[0], title: ['Shared text', 'Shared ordered media', 'Private hidden', 'Archived hidden'][index], bodyText: `Fixture ${index}: exact text\nSecond line`, status: index === 3 ? 'ARCHIVED' : 'READY' })));
    await db.insert(libraryItems).values(ids.slice(1).map((id, index) => ({ id: privateIds[index], userId: id, title: 'Colleague private', bodyText: `Private ${id}` })));
    for (const asset of media) {
      const key = `fixtures/${suffix}/${asset.name}`; keys.add(key); await storage.put(key, asset.bytes, asset.mimeType);
      await db.insert(mediaAssets).values({ id: asset.id, userId: ids[0], storageKey: key, originalName: asset.name, mimeType: asset.mimeType, byteSize: asset.bytes.length, checksum: hash(asset.bytes) });
    }
    await db.insert(libraryItemMedia).values(media.map((asset, position) => ({ libraryItemId: sources[1], mediaId: asset.id, position })));
    const [admin, a, b] = await Promise.all(ids.map(login));
    const originals = await db.select().from(libraryItems).where(inArray(libraryItems.id, sources));
    const originalAssets = await db.select().from(mediaAssets).where(eq(mediaAssets.userId, ids[0]));
    const baseline = await Promise.all([posts, postTargets, publications].map(table => db.select().from(table)));
    return { api, login, cleanup, db, ids, sources, privateIds, media, admin, a, b, originals, originalAssets, baseline, storage, password, backend, base: backend.replace('127.0.0.1', 'localhost') };
  } catch (error) { await cleanup(); throw error; }
}

export async function runSharedLibraryHttpSmoke() {
  const fixture = await startSharedLibraryRuntime();
  const { api, db, ids, sources, privateIds, media, admin, a, b, originals, originalAssets, baseline, storage } = fixture;
  const expectStatus = async (response, expected, label) => { assert.equal(response.status, expected, label); assert.match(response.headers.get('cache-control') || '', /no-store/, `${label}: private response`); return response; };
  const list = async cookie => (await (await expectStatus(await api('/api/shared-library', cookie), 200, 'Shared list')).json()).items;
  const share = (id, shared = true) => api(`/api/admin/shared-library/${id}`, admin, 'POST', { shared });
  const copy = (cookie, selected, key = randomUUID()) => api('/api/shared-library/copy', cookie, 'POST', { ids: selected }, { 'idempotency-key': key });
  try {
    await expectStatus(await api('/api/shared-library'), 401, 'Anonymous shared library');
    await expectStatus(await api('/api/admin/shared-library', a), 403, 'USER admin list denied');
    await expectStatus(await api(`/api/admin/shared-library/${sources[0]}`, a, 'POST', { shared: true }), 403, 'USER publish denied');
    assert.equal((await list(a)).length, 0, 'Nothing implicitly published');
    await expectStatus(await api(`/api/admin/shared-library/${privateIds[0]}`, admin, 'POST', { shared: true }), 404, 'ADMIN foreign source denied');
    await expectStatus(await share(sources[3]), 409, 'Archived source cannot be published');
    await expectStatus(await api(`/api/admin/shared-library/${sources[0]}`, admin, 'POST', { shared: true, userId: ids[1] }), 403, 'Forged owner denied');
    await expectStatus(await share(sources[0]), 200, 'Publish text'); await expectStatus(await share(sources[1]), 200, 'Publish ordered media');
    const sourceList = await expectStatus(await api('/api/admin/shared-library', admin), 200, 'ADMIN own publication state');
    assert.deepEqual((await sourceList.json()).sourceIds.sort(), sources.slice(0, 2).sort());
    const shared = await list(a); assert.equal(shared.length, 2);
    assert.deepEqual((await list(b)).map(item => item.id).sort(), shared.map(item => item.id).sort(), 'A/B see same explicit materials');
    assert.ok(!JSON.stringify(shared).includes(ids[0]) && !JSON.stringify(shared).includes(sources[2]), 'No private actor/source IDs or hidden material');
    for (const item of shared) { assert.deepEqual(Object.keys(item).sort(), ['id', 'media', 'text', 'title', 'updatedAt']); assert.ok(!sources.includes(item.id)); }
    const text = shared.find(item => item.title === 'Shared text'), ordered = shared.find(item => item.title === 'Shared ordered media');
    assert.equal(text.text, originals.find(row => row.id === sources[0]).bodyText);
    assert.deepEqual(ordered.media.map(item => [item.name, item.mimeType]), media.map(item => [item.name, item.mimeType]));
    for (let index = 0; index < media.length; index++) {
      assert.deepEqual(Object.keys(ordered.media[index]).sort(), ['mimeType', 'name', 'previewUrl']);
      const preview = new URL(ordered.media[index].previewUrl); assert.ok(preview.searchParams.has('X-Amz-Signature'));
      // Docker previews point at host loopback; storage reads use its internal endpoint.
      const reader = process.env.PLANLY_SHARED_LIBRARY_HTTP_TEST === 'isolated-ci' ? createS3Storage({ ...process.env, S3_PUBLIC_ENDPOINT: process.env.S3_ENDPOINT }) : storage;
      const readUrl = process.env.PLANLY_SHARED_LIBRARY_HTTP_TEST === 'isolated-ci' ? await reader.signedGetUrl(originalAssets.find(row => row.id === media[index].id).storageKey) : preview;
      assert.deepEqual(Buffer.from(await (await fetch(readUrl)).arrayBuffer()), media[index].bytes);
      const unsigned = new URL(preview); unsigned.search = '';
      if (process.env.PLANLY_SHARED_LIBRARY_HTTP_TEST !== 'isolated-ci') assert.equal((await fetch(unsigned)).status, 403, 'Private object cannot be fetched unsigned');
    }
    await expectStatus(await copy(a, [sources[0]]), 404, 'Direct private source id is not a share id');
    await expectStatus(await copy(a, [ordered.id, randomUUID()]), 404, 'Mixed batch is atomic');
    assert.equal((await db.select().from(libraryItems).where(eq(libraryItems.userId, ids[1]))).length, 1);
    await expectStatus(await copy(a, [text.id, text.id]), 422, 'Duplicate selection denied');
    const key = randomUUID(), selected = [ordered.id, text.id];
    const copied = await expectStatus(await copy(a, selected, key), 201, 'Atomic ordered batch copy'); const result = await copied.json();
    assert.deepEqual(result.items.map(item => item.title), ['Shared ordered media', 'Shared text']);
    for (const item of result.items) assert.ok(item.status === 'READY' && item.sourcePostId === null && !sources.includes(item.id));
    const copiedMedia = await db.select().from(libraryItemMedia).where(eq(libraryItemMedia.libraryItemId, result.items[0].id)).orderBy(asc(libraryItemMedia.position));
    assert.deepEqual(result.items[0].mediaIds, copiedMedia.map(row => row.mediaId));
    for (let index = 0; index < copiedMedia.length; index++) {
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, copiedMedia[index].mediaId));
      assert.equal(asset.userId, ids[1]); assert.ok(!media.some(original => original.id === asset.id));
      assert.ok(!originalAssets.some(original => original.storageKey === asset.storageKey)); assert.equal(asset.checksum, hash(media[index].bytes));
      const url = await storage.signedGetUrl(asset.storageKey);
      // In Docker public previews use host localhost; obtain an internal signed URL instead.
      const reader = process.env.PLANLY_SHARED_LIBRARY_HTTP_TEST === 'isolated-ci' ? createS3Storage({ ...process.env, S3_PUBLIC_ENDPOINT: process.env.S3_ENDPOINT }) : storage;
      assert.deepEqual(Buffer.from(await (await fetch(await reader.signedGetUrl(asset.storageKey))).arrayBuffer()), media[index].bytes);
      assert.ok(url.includes('X-Amz-Signature'));
      await expectStatus(await api(`/api/media/${asset.id}`, b, 'DELETE'), 404, 'B cannot mutate A copied media');
    }
    const retries = await Promise.all([copy(a, selected, key), copy(a, selected, key)]);
    for (const response of retries) { await expectStatus(response, 201, 'Same-key replay'); assert.deepEqual((await response.json()).items.map(item => item.id), result.items.map(item => item.id)); }
    await expectStatus(await copy(a, [text.id], key), 409, 'Key/input mismatch denied');
    for (const cookie of [a, b]) {
      await expectStatus(await api(`/api/library-items/${sources[0]}`, cookie, 'DELETE'), 404, 'Foreign private source denied');
      await expectStatus(await api(`/api/media/${media[0].id}`, cookie, 'DELETE'), 404, 'Foreign original media denied');
    }
    await expectStatus(await share(sources[1], false), 200, 'Unshare');
    await expectStatus(await copy(b, [ordered.id]), 404, 'Unshared material cannot be newly copied');
    await expectStatus(await copy(a, selected, key), 201, 'Committed receipt survives unshare');
    assert.equal((await api(`/api/library-items/${result.items[1].id}`, a, 'DELETE')).status, 204, 'Delete own copied text');
    await expectStatus(await copy(a, selected, key), 410, 'Deleted destination is terminal, never duplicated');
    assert.equal((await db.select().from(libraryItems).where(eq(libraryItems.userId, ids[1]))).length, 2, 'One original plus one surviving copied item');
    assert.equal((await db.select().from(libraryItems).where(eq(libraryItems.userId, ids[2]))).length, 1, 'B private library unchanged');
    assert.deepEqual(await db.select().from(libraryItems).where(inArray(libraryItems.id, sources)), originals, 'Original content/status unchanged');
    assert.deepEqual(await db.select().from(mediaAssets).where(eq(mediaAssets.userId, ids[0])), originalAssets, 'Original media unchanged');
    assert.deepEqual(await Promise.all([posts, postTargets, publications].map(table => db.select().from(table))), baseline, 'No Post, schedule target, publication or worker queue input created');
    console.log('PASS shared-library compiled HTTP: real ADMIN/A/B, explicit READY sharing, private IDs denied, strict DTO, image/video bytes/order, atomic copies, independent ownership, parallel replay/mismatch/deleted receipt, unshare and unchanged originals; Post/Queue creation 0, provider sends 0');
  } finally { await fixture.cleanup(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href || process.env.PLANLY_SHARED_LIBRARY_HTTP_TEST === 'isolated-ci') {
  try { await runSharedLibraryHttpSmoke(); }
  catch (error) {
    // Never stringify responses, cookies, env, credentials or signed URLs.
    console.error(error instanceof Error ? error.message.split('\n')[0] : 'Shared-library HTTP smoke failed');
    if (error instanceof assert.AssertionError && typeof error.actual === 'number' && typeof error.expected === 'number') console.error(`HTTP status ${error.actual}; expected ${error.expected}`);
    process.exitCode = 1;
  }
}
