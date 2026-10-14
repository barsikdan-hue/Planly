// Real compiled HTTP enrollment against disposable local/Compose fixtures only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { eq, inArray } from 'drizzle-orm';
import { getDb, closeDb } from '../db/index.ts';
import { users, userInvitations, posts, mediaAssets, libraryItems, sessions } from '../db/schema.ts';
import { ensureOwner } from '../lib/server/auth/owner.ts';

const database = new URL(process.env.DATABASE_URL || '');
const local = ['127.0.0.1', 'localhost'].includes(database.hostname) && database.pathname === '/planly_test';
const docker = process.env.PLANLY_MULTIUSER_HTTP_TEST === 'isolated-ci' && database.hostname === 'postgres' && database.pathname === '/planly';
assert.ok(local || docker, 'Disposable database required');
assert.ok(process.env.OWNER_EMAIL?.endsWith('@example.test'), 'Synthetic owner required');
const base = process.env.PLANLY_MULTIUSER_BASE_URL || 'http://127.0.0.1:4320';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Loopback HTTP required');
const db = getDb(), suffix = randomUUID();
const emails = ['a', 'b', 'revoked', 'expired'].map(name => `invite-http-${name}-${suffix}@example.test`);
const password = 'invite-fixture-password';
const cookies = [];
let server;
const api = (path, cookie = '', method = 'GET', body, extra = {}) => fetch(`${base}${path}`, {
  method, redirect: 'manual', signal: AbortSignal.timeout(10000),
  headers: { cookie, 'content-type': 'application/json', 'x-forwarded-for': `invite-http-${suffix}`, ...extra },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const expectStatus = async (response, expected, step) => {
  assert.equal(response.status, expected, step);
  assert.match(response.headers.get('cache-control') || '', /no-store/, `${step}: private response`);
  return response;
};
const cookieFrom = response => {
  const value = response.headers.get('set-cookie') || '';
  assert.ok(/HttpOnly/i.test(value) && /SameSite=Lax/i.test(value), 'Protected session cookie required');
  return value.split(';')[0];
};
async function login(email) {
  const response = await expectStatus(await api('/api/auth/login', '', 'POST', { email, password: email === process.env.OWNER_EMAIL ? process.env.PLANLY_OWNER_PASSWORD || 'ci-test-owner-password' : password }), 200, 'Login');
  const cookie = cookieFrom(response); cookies.push(cookie); return cookie;
}
try {
  const owner = await ensureOwner();
  const beforeOwner = (await db.select().from(users).where(eq(users.id, owner.id)))[0];
  if (!process.env.PLANLY_MULTIUSER_BASE_URL) {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '4320'], { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'ignore', windowsHide: true });
    const deadline = Date.now() + 30000; let ready = false;
    while (Date.now() < deadline && server.exitCode === null) { try { ready = (await api('/api/health')).ok; } catch {} if (ready) break; await delay(200); }
    assert.ok(ready, 'Compiled HTTP startup');
  }
  const adminCookie = await login(process.env.OWNER_EMAIL);
  const ownerSessions = await db.select().from(sessions).where(eq(sessions.userId, owner.id));
  await expectStatus(await api('/api/admin/invitations'), 401, 'Anonymous admin API');
  const invite = async email => {
    const response = await expectStatus(await api('/api/admin/invitations', adminCookie, 'POST', { email }), 201, 'Create invitation');
    const body = await response.json();
    assert.ok(typeof body.token === 'string' && body.token.length >= 32, 'Opaque token required');
    return body;
  };
  await expectStatus(await api('/api/admin/invitations', adminCookie, 'POST', { email: emails[0] }, { origin: 'https://foreign.example', 'sec-fetch-site': 'cross-site' }), 403, 'CSRF create');
  const a = await invite(emails[0]), b = await invite(emails[1]);
  await expectStatus(await api('/api/admin/invitations', adminCookie, 'POST', { email: emails[0] }), 409, 'Duplicate pending email');
  for (const token of [a.token, b.token]) {
    const stored = await db.select().from(userInvitations).where(inArray(userInvitations.email, emails));
    assert.ok(!JSON.stringify(stored).includes(token), 'DB must contain hashes only');
    assert.ok(stored.every(row => /^[a-f0-9]{64}$/.test(row.tokenHash)), 'Token hash format');
    const list = await expectStatus(await api('/api/admin/invitations', adminCookie), 200, 'Private invitation list');
    assert.ok(!(await list.text()).includes(token), 'List must never return activation token');
  }
  await expectStatus(await api('/api/auth/invitations/accept', '', 'POST', { token: a.token, password: 'short' }), 422, 'Password policy');
  await expectStatus(await api('/api/auth/invitations/accept', '', 'POST', { token: a.token, password, email: emails[1] }), 422, 'Forged email');
  for (const forged of [{ role: 'ADMIN' }, { userId: owner.id }]) await expectStatus(await api('/api/auth/invitations/accept', '', 'POST', { token: a.token, password, ...forged }), 403, 'Forged identity');
  await expectStatus(await api('/api/auth/invitations/accept', '', 'POST', { token: a.token, password }, { origin: 'https://foreign.example', 'sec-fetch-site': 'cross-site' }), 403, 'CSRF activation');
  const inspected = await expectStatus(await api('/api/auth/invitations/inspect', '', 'POST', { token: a.token }), 200, 'Inspect invitation');
  const inspectedBody = await inspected.json(); assert.equal(inspectedBody.email, emails[0]); assert.ok(!JSON.stringify(inspectedBody).includes(a.token), 'Inspection does not echo token');
  const acceptedA = await expectStatus(await api('/api/auth/invitations/accept', '', 'POST', { token: a.token, password }), 200, 'Activate A');
  const aCookie = cookieFrom(acceptedA); cookies.push(aCookie);
  const races = await Promise.all(Array.from({ length: 2 }, () => api('/api/auth/invitations/accept', '', 'POST', { token: b.token, password })));
  assert.deepEqual(races.map(response => response.status).sort(), [200, 410], 'Atomic parallel activation');
  const bCookie = cookieFrom(races.find(response => response.status === 200)); cookies.push(bCookie);
  await expectStatus(await api('/api/auth/invitations/accept', '', 'POST', { token: a.token, password }), 410, 'Replay activation');
  const invited = await db.select().from(users).where(inArray(users.email, emails.slice(0, 2)));
  assert.equal(invited.length, 2, 'Exactly one user per invited email');
  assert.ok(invited.every(user => user.role === 'USER' && user.accessState === 'ACTIVE' && user.authInitialized), 'Invitation fixes USER role and access');
  for (let i = 0; i < 2; i++) {
    const cookie = [aCookie, bCookie][i];
    const response = await expectStatus(await api('/api/bootstrap', cookie), 200, 'Empty own workspace');
    const body = await response.json(); const current = invited.find(user => user.email === emails[i]);
    assert.equal(body.profile.id, current.id);
    for (const key of ['posts', 'media', 'libraryItems']) assert.deepEqual(body[key], [], `Empty private ${key}`);
    assert.ok(body.socialAccounts.every(account => !account.enabled && account.connectionStatus === 'DISCONNECTED'), 'No inherited connections');
    assert.ok(!JSON.stringify(body).includes(owner.id) && !JSON.stringify(body).includes('passwordHash') && !JSON.stringify(body).includes('tokenHash'), 'No owner or credential leak');
    for (const path of ['/api/posts', '/api/media', '/api/library-items', '/api/analytics?provider=max&period=7']) {
      const privateResponse = await expectStatus(await api(path, cookie), 200, 'Invited USER private API');
      const privateBody = await privateResponse.text();
      assert.ok(!privateBody.includes(owner.id) && !privateBody.includes('passwordHash') && !privateBody.includes('tokenHash'), 'Private API does not reveal owner identity or credentials');
    }
    await expectStatus(await api('/api/admin/invitations', cookie), 403, 'USER admin API');
    await expectStatus(await api('/api/admin/invitations', cookie, 'POST', { email: emails[2] }), 403, 'USER invite creation');
    assert.equal((await api('/', cookie)).status, 200, 'SSR session restoration');
  }
  const bId = invited.find(user => user.email === emails[1]).id;
  await db.insert(posts).values({ id: `${bId}-post`, userId: bId, baseText: 'Private B fixture' });
  await db.insert(mediaAssets).values({ id: `${bId}-media`, userId: bId, storageKey: `${bId}/private.png`, originalName: 'private.png', mimeType: 'image/png', byteSize: 3, checksum: 'abc' });
  await db.insert(libraryItems).values({ id: `${bId}-library`, userId: bId, bodyText: 'Private B library' });
  for (const cookie of [aCookie, adminCookie]) {
    await expectStatus(await api(`/api/posts/${bId}-post`, cookie, 'PATCH', { baseText: 'Foreign change', status: 'DRAFT', targets: [], mediaIds: [] }), 404, 'Foreign post mutation');
    await expectStatus(await api(`/api/media/${bId}-media`, cookie, 'DELETE'), 404, 'Foreign media access');
    await expectStatus(await api(`/api/library-items/${bId}-library`, cookie, 'DELETE'), 404, 'Foreign library access');
  }
  const revoked = await invite(emails[2]);
  await expectStatus(await api(`/api/admin/invitations/${revoked.id}`, adminCookie, 'DELETE'), 200, 'Revoke invitation');
  await expectStatus(await api('/api/auth/invitations/inspect', '', 'POST', { token: revoked.token }), 410, 'Revoked inspect');
  await expectStatus(await api('/api/auth/invitations/accept', '', 'POST', { token: revoked.token, password }), 410, 'Revoked activation');
  const expired = await invite(emails[3]);
  await db.update(userInvitations).set({ expiresAt: new Date(0) }).where(eq(userInvitations.id, expired.id));
  await expectStatus(await api('/api/auth/invitations/accept', '', 'POST', { token: expired.token, password }), 410, 'Expired activation');
  const finalList = await expectStatus(await api('/api/admin/invitations', adminCookie), 200, 'Invitation states');
  const listed = (await finalList.json()).invitations;
  for (const [email, status] of [[emails[0], 'ACCEPTED'], [emails[1], 'ACCEPTED'], [emails[2], 'REVOKED'], [emails[3], 'EXPIRED']]) assert.equal(listed.find(row => row.email === email)?.status, status, 'Correct invitation state');
  await expectStatus(await api('/api/auth/logout', aCookie, 'POST'), 200, 'Logout');
  await expectStatus(await api('/api/profile', aCookie), 401, 'Revoked session');
  const reloadedCookie = await login(emails[0]);
  await expectStatus(await api('/api/profile', reloadedCookie), 200, 'Activated password login');
  const afterOwner = (await db.select().from(users).where(eq(users.id, owner.id)))[0];
  assert.deepEqual(afterOwner, beforeOwner, 'Owner row preserved');
  assert.deepEqual(await db.select().from(sessions).where(eq(sessions.userId, owner.id)), ownerSessions, 'Existing owner sessions preserved');
  console.log('PASS compiled invitations HTTP: ADMIN/A/B enrollment, atomic activation, empty private workspaces, forged identity/CSRF/replay/revoke/expiry, hash-only storage, logout/reload and owner preservation; no provider sends');
} catch (error) {
  // Never include assertion actual/expected objects, cookies, link or body in logs.
  console.error(error instanceof Error ? error.message.split('\n')[0] : 'Invitation HTTP smoke failed'); process.exitCode = 1;
} finally {
  for (const cookie of cookies) await api('/api/auth/logout', cookie, 'POST').catch(() => {});
  if (server && server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; }
  await db.delete(userInvitations).where(inArray(userInvitations.email, emails));
  await db.delete(users).where(inArray(users.email, emails));
  await closeDb();
}
