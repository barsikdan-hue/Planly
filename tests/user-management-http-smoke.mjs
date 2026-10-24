// Real compiled HTTP, synthetic identities and nonce-owned disposable fixtures.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { eq, inArray } from 'drizzle-orm';
import { getDb, closeDb } from '../db/index.ts';
import { users, sessions, posts, mediaAssets, libraryItems, socialAccounts } from '../db/schema.ts';
import { ensureOwner } from '../lib/server/auth/owner.ts';
import { hashOwnerPassword } from '../lib/server/auth/password.ts';

const database = new URL(process.env.DATABASE_URL || '');
const local = ['127.0.0.1', 'localhost'].includes(database.hostname) && database.pathname === '/planly_test';
const docker = process.env.PLANLY_MULTIUSER_HTTP_TEST === 'isolated-ci' && database.hostname === 'postgres' && database.pathname === '/planly';
assert.ok(local || docker, 'Disposable database required');
assert.ok(process.env.OWNER_EMAIL?.endsWith('@example.test'), 'Synthetic owner required');
const base = process.env.PLANLY_MULTIUSER_BASE_URL || 'http://127.0.0.1:4320';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Loopback HTTP required');
process.env.S3_ENDPOINT ||= 'http://127.0.0.1:1';
process.env.S3_REGION ||= 'test-region'; process.env.S3_BUCKET ||= 'management-fixtures';
process.env.S3_ACCESS_KEY_ID ||= 'fixture'; process.env.S3_SECRET_ACCESS_KEY ||= 'fixture-secret';
const suffix = randomUUID(), ids = ['admin', 'a', 'b', 'other-admin'].map(name => `management-http-${name}-${suffix}`);
const password = 'management-fixture-password';
const db = getDb(), cookies = [];
let server;
const api = (path, cookie = '', method = 'GET', body, extra = {}) => fetch(`${base}${path}`, {
  method, redirect: 'manual', signal: AbortSignal.timeout(10000),
  headers: { cookie, 'content-type': 'application/json', 'x-forwarded-for': `management-${suffix}`, ...extra },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
async function status(response, expected, message) {
  assert.equal(response.status, expected, message);
  assert.match(response.headers.get('cache-control') || '', /no-store/, `${message}: private response`);
  return response;
}
async function login(id, expected = 200) {
  const response = await status(await api('/api/auth/login', '', 'POST', { email: `${id}@example.test`, password }), expected, 'Password login');
  if (expected !== 200) return '';
  const header = response.headers.get('set-cookie') || '';
  assert.ok(/HttpOnly/i.test(header) && /SameSite=Lax/i.test(header), 'Protected session cookie');
  const cookie = header.split(';')[0]; cookies.push(cookie); return cookie;
}
const targetPath = id => `/api/admin/users/${encodeURIComponent(id)}`;
try {
  const owner = await ensureOwner();
  await db.insert(users).values(await Promise.all(ids.map(async (id, index) => ({ id, email: `${id}@example.test`, displayName: `Fixture ${index}`, role: index === 0 || index === 3 ? 'ADMIN' : 'USER', accessState: 'ACTIVE', authInitialized: true, passwordHash: await hashOwnerPassword(password) }))));
  await db.insert(posts).values(ids.slice(1, 3).map(id => ({ id: `${id}-post`, userId: id, baseText: `Private ${id}` })));
  await db.insert(mediaAssets).values(ids.slice(1, 3).map(id => ({ id: `${id}-media`, userId: id, storageKey: `${id}/private.png`, originalName: `${id}.png`, mimeType: 'image/png', byteSize: 3, checksum: 'abc' })));
  await db.insert(libraryItems).values(ids.slice(1, 3).map(id => ({ id: `${id}-library`, userId: id, bodyText: `Private ${id}` })));
  await db.insert(socialAccounts).values(ids.slice(1, 3).map(id => ({ id: `${id}-account`, userId: id, provider: 'MAX', displayName: id, enabled: false })));
  if (!process.env.PLANLY_MULTIUSER_BASE_URL) {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '4320'], { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'ignore', windowsHide: true });
    const deadline = Date.now() + 30000; let ready = false;
    while (Date.now() < deadline && server.exitCode === null) { try { ready = (await api('/api/health')).ok; } catch {} if (ready) break; await delay(200); }
    assert.ok(ready, 'Compiled HTTP startup');
  }
  const admin = await login(ids[0]), a = await login(ids[1]), b = await login(ids[2]);
  const ownerBefore = (await db.select().from(users).where(eq(users.id, owner.id)))[0];
  const ownerSessions = await db.select().from(sessions).where(eq(sessions.userId, owner.id));
  await status(await api('/api/admin/users'), 401, 'Anonymous admin list');
  await status(await api('/api/admin/users', a), 403, 'USER admin list');
  await status(await api(targetPath(ids[2]), a, 'POST', { action: 'block' }), 403, 'USER admin mutation');
  const listed = await status(await api('/api/admin/users', admin), 200, 'ADMIN colleague list');
  const list = (await listed.json()).users;
  assert.ok(list.some(row => row.id === ids[1]) && list.some(row => row.id === ids[2]), 'Registered colleagues included');
  assert.ok(!list.some(row => [owner.id, ids[0], ids[3]].includes(row.id)), 'Owner and ADMIN excluded');
  for (const row of list) assert.deepEqual(Object.keys(row).sort(), ['accessExpiresAt', 'accessState', 'createdAt', 'displayName', 'email', 'id'], 'Minimal access-only DTO');
  for (const id of [ids[0], ids[3], owner.id]) await status(await api(targetPath(id), admin, 'POST', { action: 'block' }), 403, 'Protected target');
  await status(await api(targetPath(`missing-${suffix}`), admin, 'POST', { action: 'block' }), 404, 'Unknown target');
  for (const forged of [{ userId: ids[1] }, { role: 'ADMIN' }, { accessState: 'ACTIVE' }]) await status(await api(targetPath(ids[2]), admin, 'POST', { action: 'block', ...forged }), 403, 'Forged mutation');
  await status(await api(`/api/admin/users?userId=${ids[1]}`, admin), 403, 'Forged actor selector');
  await status(await api(targetPath(ids[1]), admin, 'POST', { action: 'delete' }), 422, 'Unsupported action');
  await status(await api(targetPath(ids[1]), admin, 'POST', { action: 'block' }, { origin: 'https://foreign.example', 'sec-fetch-site': 'cross-site' }), 403, 'CSRF mutation');
  for (const path of ['/api/posts', '/api/media', '/api/library-items', '/api/analytics?provider=max&period=7']) {
    const response = await status(await api(path, admin), 200, 'ADMIN private API remains personal');
    const body = await response.text();
    assert.ok(!ids.slice(1, 3).some(id => body.includes(id)) && !body.includes('passwordHash') && !body.includes('tokenHash'), 'ADMIN cannot read USER content or credentials');
  }
  await status(await api(`/api/posts/${ids[2]}-post`, admin, 'DELETE'), 404, 'ADMIN foreign Post denied');
  await status(await api(`/api/media/${ids[2]}-media`, admin, 'DELETE'), 404, 'ADMIN foreign Media denied');
  await status(await api(`/api/library-items/${ids[2]}-library`, admin, 'DELETE'), 404, 'ADMIN foreign Library denied');
  for (const [cookie, own, foreign] of [[a, ids[1], ids[2]], [b, ids[2], ids[1]]]) {
    const response = await status(await api('/api/bootstrap', cookie), 200, 'USER isolated workspace');
    const body = await response.json(); assert.equal(body.profile.id, own, 'Server session determines USER');
    assert.ok(!JSON.stringify(body).includes(foreign), 'A/B private content remains isolated');
    await status(await api(`/api/media/${foreign}-media`, cookie, 'DELETE'), 404, 'A/B direct foreign Media denied');
  }
  const blocked = await Promise.all([0, 1].map(() => api(targetPath(ids[1]), admin, 'POST', { action: 'block' })));
  for (const response of blocked) { await status(response, 200, 'Idempotent parallel block'); assert.equal((await response.json()).user.accessState, 'BLOCKED'); }
  await status(await api('/api/profile', a), 401, 'Blocked old token');
  assert.equal((await api('/', a)).status, 307, 'Blocked SSR');
  await login(ids[1], 401);
  await status(await api('/api/profile', b), 200, 'B unaffected by A block');
  await status(await api(targetPath(ids[1]), admin, 'POST', { action: 'restore' }), 200, 'Restore');
  await status(await api('/api/profile', a), 401, 'Restore never revives old token');
  const restored = await login(ids[1]);
  assert.equal((await api('/', restored)).status, 200, 'Restored new token SSR');
  await status(await api('/api/profile', restored), 200, 'Restored reload session');
  const concurrent = await Promise.all(['block', 'restore'].map(action => api(targetPath(ids[1]), admin, 'POST', { action })));
  for (const response of concurrent) await status(response, 200, 'Concurrent block restore serialized');
  await status(await api('/api/profile', restored), 401, 'Concurrent lifecycle invalidates old session');
  await status(await api(targetPath(ids[1]), admin, 'POST', { action: 'restore' }), 200, 'Normalize own fixture');
  const current = await login(ids[1]);
  await status(await api('/api/auth/logout', current, 'POST'), 200, 'Logout');
  await status(await api('/api/profile', current), 401, 'Logged-out token denied');
  const expiring = await login(ids[1]);
  await db.update(sessions).set({ expiresAt: new Date(0) }).where(eq(sessions.userId, ids[1]));
  await status(await api('/api/profile', expiring), 401, 'Expired USER session');
  const adminPage = await api('/admin/users', admin); assert.equal(adminPage.status, 200, 'ADMIN SSR users page');
  const userPage = await api('/admin/users', b); assert.equal(userPage.status, 307, 'USER SSR users page denied');
  await db.update(sessions).set({ expiresAt: new Date(0) }).where(eq(sessions.userId, ids[0]));
  await status(await api('/api/admin/users', admin), 401, 'Expired ADMIN session');
  assert.equal((await api('/admin/users', admin)).status, 307, 'Expired ADMIN SSR');
  assert.deepEqual((await db.select().from(users).where(eq(users.id, owner.id)))[0], ownerBefore, 'Owner row preserved');
  assert.deepEqual(await db.select().from(sessions).where(eq(sessions.userId, owner.id)), ownerSessions, 'Owner sessions preserved');
  console.log('PASS compiled user management HTTP: real ADMIN/A/B sessions, minimal DTO, protected identities, CSRF/forgery, parallel lifecycle, irreversible session revocation, expiry/logout/SSR, private API isolation and owner preservation; no provider sends');
} catch (error) {
  console.error(error instanceof Error ? error.message.split('\n')[0] : 'User management HTTP smoke failed');
  if (error instanceof assert.AssertionError && typeof error.actual === 'number' && typeof error.expected === 'number') console.error(`HTTP status ${error.actual}; expected ${error.expected}`);
  process.exitCode = 1;
} finally {
  for (const cookie of cookies) await api('/api/auth/logout', cookie, 'POST').catch(() => {});
  if (server && server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; }
  await db.delete(users).where(inArray(users.id, ids)); await closeDb();
}
