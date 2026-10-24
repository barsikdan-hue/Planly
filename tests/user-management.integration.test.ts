import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import { getDb, getPool, closeDb } from '../db/index.ts';
import { users, sessions, posts, mediaAssets, libraryItems, socialAccounts, loginRateLimits } from '../db/schema.ts';
import { hashOwnerPassword } from '../lib/server/auth/password.ts';
import { createOwnerSession, getOwnerBySessionToken } from '../lib/server/auth/session.ts';
import { revokeUserSessions, setUserAccessState } from '../lib/server/auth/access.ts';
import { POST as login } from '../app/api/auth/login/route.ts';
import { POST as logout } from '../app/api/auth/logout/route.ts';
import { GET as getPosts } from '../app/api/posts/route.ts';
import { PATCH as editPost } from '../app/api/posts/[id]/route.ts';
import { DELETE as deleteMedia } from '../app/api/media/[id]/route.ts';
import { DELETE as deleteLibrary } from '../app/api/library-items/[id]/route.ts';
import { PATCH as editAccount } from '../app/api/social-accounts/[id]/route.ts';
import { GET as analytics } from '../app/api/analytics/route.ts';

const isolated = new URL(process.env.DATABASE_URL!);
assert.ok(['127.0.0.1', 'localhost'].includes(isolated.hostname) && isolated.pathname === '/planly_test', 'Disposable native database required');
// Own storage inputs as well as database fixtures. CI has no production S3
// configuration; foreign-resource denial must reach its ownership check.
const storageKeys = ['S3_ENDPOINT', 'S3_PUBLIC_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
const originalStorage = Object.fromEntries(storageKeys.map(key => [key, process.env[key]]));
Object.assign(process.env, { S3_ENDPOINT: 'http://127.0.0.1:1', S3_REGION: 'test-region', S3_BUCKET: 'user-management-fixtures', S3_ACCESS_KEY_ID: 'fixture', S3_SECRET_ACCESS_KEY: 'fixture-secret' });
delete process.env.S3_PUBLIC_ENDPOINT;
const db = getDb();
const ids = ['manage-owner', 'manage-admin', 'manage-a', 'manage-b', 'manage-uninitialized'];
const password = 'User-management-fixture-password';
let passwordHash: string;
let tokens: string[];
let routes: typeof import('../app/api/admin/users/route.ts');
let mutation: typeof import('../app/api/admin/users/[id]/route.ts');
function request(path: string, token = '', method = 'GET', body?: unknown, extra: Record<string, string> = {}) {
  return new Request(`http://planly.test${path}`, { method, headers: { cookie: `planly_session=${token}`, 'content-type': 'application/json', ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function context(id: string) { return { params: Promise.resolve({ id }) }; }
async function change(id: string, action: string, token = tokens[1], extra: Record<string, string> = {}) {
  return mutation.POST(request(`/api/admin/users/${encodeURIComponent(id)}`, token, 'POST', { action }, extra), context(id));
}
async function row(id = ids[2]) { return (await db.select().from(users).where(eq(users.id, id)))[0]; }
async function waitForBlocked(pid: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await getPool().query<{ blocked: boolean }>('select exists(select 1 from pg_stat_activity where $1 = any(pg_blocking_pids(pid))) blocked', [pid]);
    if (result.rows[0].blocked) return;
    await delay(10);
  }
  assert.fail('Request never reached the held user lifecycle lock');
}
beforeEach(async () => {
  routes ??= await import('../app/api/admin/users/route.ts');
  mutation ??= await import('../app/api/admin/users/[id]/route.ts');
  passwordHash ??= await hashOwnerPassword(password);
  await db.delete(users); await db.delete(loginRateLimits);
  await db.insert(users).values(ids.map((id, index) => ({ id, email: index === 0 ? 'owner@example.test' : `${id}@example.test`, displayName: id, role: index < 2 ? 'ADMIN' as const : 'USER' as const, accessState: index === 4 ? 'BLOCKED' as const : 'ACTIVE' as const, authInitialized: index !== 4, passwordHash: index === 0 ? null : passwordHash })));
  tokens = await Promise.all(ids.slice(0, 4).map(id => createOwnerSession(id)));
  for (const id of ids.slice(0, 4)) {
    await db.insert(posts).values({ id: `${id}-post`, userId: id, baseText: `Private ${id}` });
    await db.insert(mediaAssets).values({ id: `${id}-media`, userId: id, storageKey: `${id}/private.png`, originalName: `${id}.png`, mimeType: 'image/png', byteSize: 3, checksum: 'abc' });
    await db.insert(libraryItems).values({ id: `${id}-library`, userId: id, bodyText: `Private library ${id}` });
    await db.insert(socialAccounts).values({ id: `${id}-account`, userId: id, provider: 'MAX', displayName: id, providerAccountId: `-${id}`, enabled: true, connectionStatus: 'CONNECTED' });
  }
});
after(async () => {
  try { await db.delete(users); await closeDb(); }
  finally {
    for (const key of storageKeys) {
      if (originalStorage[key] === undefined) delete process.env[key];
      else process.env[key] = originalStorage[key];
    }
  }
});

test('ADMIN sees only registered USER identity and access DTO without private content or credentials', async () => {
  const response = await routes.GET(request('/api/admin/users', tokens[1]));
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const body = await response.json(); assert.deepEqual(Object.keys(body).sort(), ['pendingDeletionCount', 'users']);
  assert.equal(body.pendingDeletionCount, 0);
  assert.deepEqual(new Set(body.users.map((user: { id: string }) => user.id)), new Set([ids[2], ids[3]]));
  for (const user of body.users) {
    assert.deepEqual(Object.keys(user).sort(), ['accessExpiresAt', 'accessState', 'createdAt', 'displayName', 'email', 'id']);
    assert.equal(user.accessExpiresAt, null);
    assert.equal(user.accessState, 'ACTIVE'); assert.ok(Number.isFinite(Date.parse(user.createdAt)));
  }
  const serialized = JSON.stringify(body);
  for (const secret of [passwordHash, ...tokens, 'Private ', 'storageKey', 'providerAccountId']) assert.ok(!serialized.includes(secret), 'Management DTO must not disclose personal or authentication data');
});

test('USER and unauthenticated actors cannot read or mutate access even with a malformed body', async () => {
  for (const token of ['', tokens[2]]) {
    const expected = token ? 403 : 401;
    assert.equal((await routes.GET(request('/api/admin/users', token))).status, expected);
    assert.equal((await change(ids[3], 'block', token)).status, expected);
    assert.equal((await mutation.POST(new Request('http://planly.test/api/admin/users/manage-b', { method: 'POST', headers: { cookie: `planly_session=${token}`, 'content-type': 'application/json' }, body: '{' }), context(ids[3]))).status, expected);
  }
  assert.equal((await row(ids[3])).accessState, 'ACTIVE');
});

test('blocked, expired and revoked ADMIN sessions fail closed on list and mutation', async () => {
  await db.update(sessions).set({ expiresAt: new Date(0) }).where(eq(sessions.userId, ids[1]));
  assert.equal((await routes.GET(request('/api/admin/users', tokens[1]))).status, 401);
  assert.equal((await change(ids[2], 'block')).status, 401);
  const fresh = await createOwnerSession(ids[1]); await revokeUserSessions(ids[1]);
  assert.equal((await change(ids[2], 'block', fresh)).status, 401);
  const blocked = await createOwnerSession(ids[1]); await setUserAccessState(ids[1], 'BLOCKED');
  assert.equal((await routes.GET(request('/api/admin/users', blocked))).status, 401);
  assert.equal((await change(ids[2], 'block', blocked)).status, 401);
});

test('forged identities, role/accessState selectors, unknown actions and cross-origin mutations are rejected', async () => {
  for (const body of [{ action: 'block', role: 'ADMIN' }, { action: 'block', accessState: 'ACTIVE' }, { action: 'block', userId: ids[3] }, { action: 'block', ownerId: ids[0] }]) {
    assert.equal((await mutation.POST(request('/api/admin/users/manage-a', tokens[1], 'POST', body), context(ids[2]))).status, 403);
  }
  for (const body of [{ action: 'delete' }, { action: 'ACTIVE' }, {}, { action: 'block', email: 'forged@example.test' }]) assert.equal((await mutation.POST(request('/api/admin/users/manage-a', tokens[1], 'POST', body), context(ids[2]))).status, 422);
  assert.equal((await routes.GET(request('/api/admin/users?userId=manage-b', tokens[1]))).status, 403);
  assert.equal((await routes.GET(request('/api/admin/users', tokens[1], 'GET', undefined, { 'x-user-id': ids[3] }))).status, 403);
  for (const headers of [{ origin: 'https://attacker.test' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }] as Record<string, string>[]) assert.equal((await change(ids[2], 'block', tokens[1], headers)).status, 403);
  assert.equal((await row()).accessState, 'ACTIVE');
});

test('self, any ADMIN and configured owner remain protected while missing or uninitialized users are not manageable', async () => {
  for (const id of [ids[0], ids[1]]) for (const action of ['block', 'restore']) assert.equal((await change(id, action)).status, 403);
  await db.update(users).set({ role: 'USER', email: ' OWNER@EXAMPLE.TEST ' }).where(eq(users.id, ids[0]));
  assert.equal((await change(ids[0], 'block')).status, 403);
  const listing = await (await routes.GET(request('/api/admin/users', tokens[1]))).json(); assert.ok(!listing.users.some((u: { id: string }) => u.id === ids[0]));
  for (const id of ['missing-user', ids[4]]) assert.equal((await change(id, 'block')).status, 404);
});

test('two ADMINs cannot acquire each other as lifecycle targets under parallel requests', async () => {
  const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => change(index % 2 ? ids[0] : ids[1], 'block', tokens[index % 2 ? 1 : 0])));
  assert.ok(responses.every(response => response.status === 403));
  assert.equal((await row(ids[0])).accessState, 'ACTIVE'); assert.equal((await row(ids[1])).accessState, 'ACTIVE');
});

test('block then restore invalidates old sessions permanently, keeps B private, and permits a fresh A login', async () => {
  const ownerBefore = await row(ids[0]); const adminBefore = await row(ids[1]);
  const secondA = await createOwnerSession(ids[2]);
  const blocked = await change(ids[2], 'block'); assert.equal(blocked.status, 200); assert.equal((await blocked.json()).user.accessState, 'BLOCKED');
  for (const token of [tokens[2], secondA]) assert.equal(await getOwnerBySessionToken(token), null);
  assert.equal((await getPosts(request('/api/posts', tokens[2]))).status, 401);
  await assert.rejects(createOwnerSession(ids[2]));
  const denied = await login(request('/api/auth/login', '', 'POST', { email: `${ids[2]}@example.test`, password }, { 'x-forwarded-for': randomUUID() })); assert.equal(denied.status, 401);
  const restored = await change(ids[2], 'restore'); assert.equal(restored.status, 200); assert.equal((await restored.json()).user.accessState, 'ACTIVE');
  for (const token of [tokens[2], secondA]) assert.equal(await getOwnerBySessionToken(token), null);
  const signedIn = await login(request('/api/auth/login', '', 'POST', { email: `${ids[2]}@example.test`, password }, { 'x-forwarded-for': randomUUID() })); assert.equal(signedIn.status, 200);
  const freshToken = signedIn.headers.get('set-cookie')!.match(/planly_session=([^;]+)/)![1];
  assert.equal((await getOwnerBySessionToken(freshToken))?.id, ids[2]);
  assert.equal((await logout(request('/api/auth/logout', freshToken, 'POST'))).status, 200); assert.equal(await getOwnerBySessionToken(freshToken), null);
  assert.equal((await getOwnerBySessionToken(tokens[3]))?.id, ids[3]); assert.equal((await row()).sessionVersion, 2);
  assert.deepEqual(await row(ids[0]), ownerBefore); assert.deepEqual(await row(ids[1]), adminBefore);
});

test('double block and restore are idempotent; parallel opposite actions serialize without losing invalidation', async () => {
  const blocked = await Promise.all(Array.from({ length: 8 }, () => change(ids[2], 'block')));
  assert.ok(blocked.every(response => response.status === 200)); assert.equal((await row()).sessionVersion, 1);
  const restored = await Promise.all(Array.from({ length: 8 }, () => change(ids[2], 'restore')));
  assert.ok(restored.every(response => response.status === 200)); assert.equal((await row()).sessionVersion, 2);
  const responses = await Promise.all(Array.from({ length: 12 }, (_, index) => change(ids[2], index % 2 ? 'restore' : 'block', tokens[index % 2])));
  assert.ok(responses.every(response => response.status === 200)); assert.equal(await getOwnerBySessionToken(tokens[2]), null);
  assert.equal((await getOwnerBySessionToken(tokens[3]))?.id, ids[3]);
});

test('ADMIN admission rechecks its locked role and session after a concurrent demotion or revocation', async () => {
  for (const mode of ['role', 'session']) {
    const token = await createOwnerSession(ids[1]); const client = await getPool().connect(); let pending: Promise<Response> | undefined;
    try {
      await client.query('begin'); await client.query('select id from users where id=$1 for update', [ids[1]]);
      const { rows: [{ pid }] } = await client.query<{ pid: number }>('select pg_backend_pid() pid');
      pending = change(ids[2], 'block', token); await waitForBlocked(pid);
      if (mode === 'role') await client.query("update users set role='USER' where id=$1", [ids[1]]);
      else await client.query('delete from sessions where user_id=$1', [ids[1]]);
      await client.query('commit'); assert.equal((await pending).status, mode === 'role' ? 403 : 401);
      assert.equal((await row()).accessState, 'ACTIVE');
    } finally { await client.query('rollback'); client.release(); if (pending) await pending; }
    await db.update(users).set({ role: 'ADMIN' }).where(eq(users.id, ids[1]));
  }
});

test('target eligibility is rechecked under its lock before an ADMIN status write', async () => {
  const client = await getPool().connect(); let pending: Promise<Response> | undefined;
  try {
    await client.query('begin'); await client.query('select id from users where id=$1 for update', [ids[2]]);
    const { rows: [{ pid }] } = await client.query<{ pid: number }>('select pg_backend_pid() pid');
    pending = change(ids[2], 'block'); await waitForBlocked(pid);
    await client.query("update users set role='ADMIN' where id=$1", [ids[2]]); await client.query('commit');
    assert.equal((await pending).status, 403); assert.equal((await row()).accessState, 'ACTIVE');
  } finally { await client.query('rollback'); client.release(); if (pending) await pending; }
});

test('access changes and session issuance share the target lock and reject a stale password snapshot', async () => {
  const client = await getPool().connect(); let pending: Promise<Response> | undefined; let issuing: Promise<unknown> | undefined;
  try {
    await client.query('begin'); await client.query('select id from users where id=$1 for update', [ids[2]]);
    const { rows: [{ pid }] } = await client.query<{ pid: number }>('select pg_backend_pid() pid');
    pending = change(ids[2], 'block'); await waitForBlocked(pid);
    issuing = createOwnerSession(ids[2], 0).then(() => 'issued', () => 'denied');
    await client.query('commit'); assert.equal((await pending).status, 200); assert.equal(await issuing, 'denied');
    assert.equal((await getPool().query('select count(*)::int n from sessions where user_id=$1', [ids[2]])).rows[0].n, 0);
  } finally { await client.query('rollback'); client.release(); if (pending) await pending; if (issuing) await issuing; }
});

test('management never gives ADMIN private USER posts, media, library, analytics or social credentials', async () => {
  assert.equal((await routes.GET(request('/api/admin/users', tokens[1]))).status, 200);
  const ownPosts = await (await getPosts(request('/api/posts', tokens[1]))).json(); assert.deepEqual(ownPosts.map((p: { id: string }) => p.id), [`${ids[1]}-post`]);
  for (const id of [ids[2], ids[3]]) {
    assert.equal((await editPost(request(`/api/posts/${id}-post`, tokens[1], 'PATCH', { baseText: 'attack', status: 'DRAFT', targets: [], mediaIds: [] }), context(`${id}-post`))).status, 404);
    assert.equal((await deleteMedia(request(`/api/media/${id}-media`, tokens[1], 'DELETE'), context(`${id}-media`))).status, 404);
    assert.equal((await deleteLibrary(request(`/api/library-items/${id}-library`, tokens[1], 'DELETE'), context(`${id}-library`))).status, 404);
    assert.ok([403, 404].includes((await editAccount(request(`/api/social-accounts/${id}-account`, tokens[1], 'PATCH', { enabled: false }), context(`${id}-account`))).status));
  }
  const analytic = await analytics(request('/api/analytics', tokens[1])); assert.equal(analytic.status, 200);
  const serialized = await analytic.text(); assert.ok(!serialized.includes(ids[2]) && !serialized.includes(ids[3]));
});
