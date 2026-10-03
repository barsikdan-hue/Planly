import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb, getDb } from '../db/index.ts';
import { inArray } from 'drizzle-orm';
import { mediaAssets, posts, publications, socialAccounts, users } from '../db/schema.ts';
import { createOwnerSession, SESSION_COOKIE_NAME } from '../lib/server/auth/session.ts';
import { POST } from '../app/api/posts/route.ts';
import { createPost, updatePost } from '../lib/server/posts.ts';

const key = '45a494bd-2aa4-4e47-a3b7-85c6aefb8854';
const owner = 'idempotency-owner';
let token = '';
const original = { baseText: 'Original', status: 'READY', targets: [{ provider: 'telegram', textOverride: null, scheduledAt: '2030-01-01T09:00:00Z' }], mediaIds: [] };
function request(input: unknown, creationKey = key) {
  return new Request('http://planly.test/api/posts', { method: 'POST', headers: {
    cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`, 'content-type': 'application/json', 'idempotency-key': creationKey,
  }, body: JSON.stringify(input) });
}
beforeEach(async () => {
  const db = getDb();
  await db.delete(users).where(inArray(users.id, [owner, 'idempotency-other']));
  await db.insert(users).values({ id: owner, email: process.env.OWNER_EMAIL ?? 'owner@example.test', displayName: 'Owner' });
  await db.insert(socialAccounts).values(['TELEGRAM', 'MAX'].map(provider => ({ id: `idempotency-${provider}`, userId: owner, provider: provider as 'TELEGRAM' | 'MAX', displayName: provider })));
  token = await createOwnerSession(owner);
});
after(closeDb);

test('concurrent POST retries with one key create one post and one publication', {
  skip: process.env.PLANLY_TEST_DB_PGLITE === '1' ? 'PGlite socket multiplexing cannot prove concurrent transaction isolation; native PostgreSQL CI covers this race.' : false,
}, async () => {
  const responses = await Promise.all([POST(request(original)), POST(request(original)), POST(request(original))]);
  const bodies = await Promise.all(responses.map(response => response.json()));
  assert.ok(responses.every(response => response.status === 201));
  assert.equal(new Set(bodies.map(body => body.id)).size, 1);
  assert.equal((await getDb().select().from(posts)).filter(post => post.userId === owner).length, 1);
  assert.equal((await getDb().select().from(publications)).filter(post => post.userId === owner).length, 1);
});

test('sequential lost-response POST retry returns one post and one publication', async () => {
  const first = await (await POST(request(original))).json();
  const second = await POST(request(original));
  assert.equal(second.status, 201);
  assert.equal((await second.json()).id, first.id);
  assert.equal((await getDb().select().from(posts)).filter(post => post.userId === owner).length, 1);
  assert.equal((await getDb().select().from(publications)).filter(post => post.userId === owner).length, 1);
});

test('same creation key is isolated between owners', async () => {
  await getDb().insert(users).values({ id: 'idempotency-other', email: 'other-idempotency@example.test', displayName: 'Other' });
  const input = { baseText: 'Private', status: 'DRAFT' as const, targets: [], mediaIds: [] };
  const first = await createPost(owner, input, { creationKey: key, mirrorQueue: async () => undefined });
  const other = await createPost('idempotency-other', input, { creationKey: key, mirrorQueue: async () => undefined });
  assert.notEqual(first.id, other.id);
  const replay = await createPost(owner, input, { creationKey: key, mirrorQueue: async () => undefined });
  assert.equal(replay.id, first.id);
});

test('a key is bound to its original request even after the post was edited', async () => {
  const created = await (await POST(request(original))).json();
  await updatePost(owner, created.id, { ...original, status: 'DRAFT', baseText: 'Edited', targets: [] }, { mirrorQueue: async () => undefined });
  const replay = await POST(request(original));
  assert.equal(replay.status, 201);
  assert.equal((await replay.json()).id, created.id);
  const mismatch = await POST(request({ ...original, baseText: 'Different original' }));
  assert.equal(mismatch.status, 409);
  assert.equal((await getDb().select().from(posts)).filter(post => post.userId === owner).length, 1);
});

test('a rejected first request can be corrected using its uncommitted key', async () => {
  const rejected = await POST(request({ ...original, baseText: 'x'.repeat(4097) }));
  assert.equal(rejected.status, 422);
  const corrected = await POST(request(original));
  assert.equal(corrected.status, 201);
  assert.equal((await getDb().select().from(posts)).filter(post => post.userId === owner).length, 1);
});

test('malformed creation key is rejected before persistence', async () => {
  assert.equal((await POST(request(original, 'not-a-uuid'))).status, 422);
  assert.equal((await getDb().select().from(posts)).filter(post => post.userId === owner).length, 0);
});

test('replaying creation does not repeat queue reconciliation or mirroring', async () => {
  let mirrors = 0;
  const options = { creationKey: key, mirrorQueue: async () => { mirrors++; } };
  const first = await createPost(owner, { ...original, status: 'READY', targets: [{ provider: 'telegram', textOverride: null, scheduledAt: original.targets[0].scheduledAt }] }, options);
  const replay = await createPost(owner, { ...original, status: 'READY', targets: [{ provider: 'telegram', textOverride: null, scheduledAt: original.targets[0].scheduledAt }] }, options);
  assert.equal(replay.id, first.id);
  assert.equal(mirrors, 1);
});

test('target order is canonical while media order remains part of original identity', async () => {
  await getDb().insert(mediaAssets).values(['first', 'second'].map(id => ({ id, userId: owner, storageKey: id, originalName: `${id}.png`, mimeType: 'image/png', byteSize: 20, width: 100, height: 100, checksum: id })));
  const input = { ...original, targets: [...original.targets, { provider: 'max', textOverride: null, scheduledAt: '2030-01-01T09:00:00Z' }], mediaIds: ['first', 'second'] };
  const first = await (await POST(request(input))).json();
  const reorderedTargets = await POST(request({ ...input, targets: [...input.targets].reverse() }));
  assert.equal(reorderedTargets.status, 201);
  assert.equal((await reorderedTargets.json()).id, first.id);
  assert.equal((await POST(request({ ...input, mediaIds: ['second', 'first'] }))).status, 409);
});
