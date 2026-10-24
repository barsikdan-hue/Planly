import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { getDb, closeDb } from '../db/index.ts';
import { users, sessions, posts, postTargets, socialAccounts, publications } from '../db/schema.ts';
import { hashOwnerPassword } from '../lib/server/auth/password.ts';
import { createOwnerSession } from '../lib/server/auth/session.ts';

const isolated = new URL(process.env.DATABASE_URL!);
assert.ok(['127.0.0.1', 'localhost'].includes(isolated.hostname) && isolated.pathname === '/planly_test', 'Disposable native database required');
const db = getDb();
const ids = { admin: 'admin-posts-admin', agent: 'admin-posts-agent', other: 'admin-posts-other' };
const postId = 'admin-posts-post';
const targetId = 'admin-posts-target';
let adminToken: string;

function request(path: string, token: string, method = 'GET', body?: unknown) {
  return new Request(`http://planly.test${path}`, {
    method,
    headers: { cookie: `planly_session=${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(async () => {
  const passwordHash = await hashOwnerPassword('admin-posts-password');
  await db.delete(publications); await db.delete(postTargets); await db.delete(posts); await db.delete(socialAccounts); await db.delete(sessions); await db.delete(users);
  await db.insert(users).values([
    { id: ids.admin, email: 'admin-posts-admin@example.test', displayName: 'Admin', role: 'ADMIN', accessState: 'ACTIVE', authInitialized: true, passwordHash },
    { id: ids.agent, email: 'admin-posts-agent@example.test', displayName: 'Agent', role: 'USER', accessState: 'ACTIVE', authInitialized: true, passwordHash },
    { id: ids.other, email: 'admin-posts-other@example.test', displayName: 'Other', role: 'USER', accessState: 'ACTIVE', authInitialized: true, passwordHash },
  ]);
  adminToken = await createOwnerSession(ids.admin);
  await db.insert(socialAccounts).values({ id: 'admin-posts-account', userId: ids.agent, provider: 'MAX', displayName: 'Agent MAX', providerAccountId: 'agent-max', enabled: true, connectionStatus: 'CONNECTED' });
  await db.insert(posts).values({ id: postId, userId: ids.agent, baseText: 'Agent post', status: 'READY' });
  await db.insert(postTargets).values({ id: targetId, postId, socialAccountId: 'admin-posts-account', scheduledAt: new Date('2030-01-02T07:00:00.000Z'), active: true });
});

after(async () => { await db.delete(users); await closeDb(); });

test('ADMIN can list an agent schedule without credentials or private media', async () => {
  const { GET } = await import('../app/api/admin/users/[id]/posts/route.ts');
  const response = await GET(request(`/api/admin/users/${ids.agent}/posts`, adminToken), { params: Promise.resolve({ id: ids.agent }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.posts.length, 1);
  assert.equal(body.posts[0].id, postId);
  assert.equal(body.posts[0].targets[0].scheduledAt, '2030-01-02T07:00:00.000Z');
  assert.ok(!JSON.stringify(body).includes('providerAccountId'));
});

test('ADMIN reschedules only the selected agent target and rejects published posts', async () => {
  const { PATCH } = await import('../app/api/admin/users/[id]/posts/route.ts');
  const response = await PATCH(request(`/api/admin/users/${ids.agent}/posts`, adminToken, 'PATCH', { postId, provider: 'max', scheduledAt: '2030-01-03T07:00:00.000Z' }), { params: Promise.resolve({ id: ids.agent }) });
  assert.equal(response.status, 200);
  assert.equal((await db.select().from(postTargets).where(eq(postTargets.id, targetId)))[0].scheduledAt?.toISOString(), '2030-01-03T07:00:00.000Z');
  await db.update(posts).set({ status: 'READY' }).where(eq(posts.id, postId));
  await db.insert(publications).values({ id: 'admin-posts-publication', userId: ids.agent, postId, postTargetId: targetId, provider: 'MAX', status: 'PUBLISHED', publishedAt: new Date(), providerRemoteId: 'remote', idempotencyKey: 'admin-posts-idempotency' });
  const blocked = await PATCH(request(`/api/admin/users/${ids.agent}/posts`, adminToken, 'PATCH', { postId, provider: 'max', scheduledAt: '2030-01-04T07:00:00.000Z' }), { params: Promise.resolve({ id: ids.agent }) });
  assert.equal(blocked.status, 409);
});

test('USER cannot use the admin schedule endpoint for another user', async () => {
  const { GET } = await import('../app/api/admin/users/[id]/posts/route.ts');
  const token = await createOwnerSession(ids.agent);
  const response = await GET(request(`/api/admin/users/${ids.other}/posts`, token), { params: Promise.resolve({ id: ids.other }) });
  assert.equal(response.status, 403);
});
