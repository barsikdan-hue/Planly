import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb, getDb } from '../db/index.ts';
import { eq, inArray } from 'drizzle-orm';
import { libraryItems, mediaAssets, posts, publications, socialAccounts, users } from '../db/schema.ts';
import { createOwnerSession, SESSION_COOKIE_NAME } from '../lib/server/auth/session.ts';
import { POST } from '../app/api/posts/route.ts';
import { createPost, deletePost, updatePost } from '../lib/server/posts.ts';
import { closePublicationQueue } from '../lib/server/scheduler/queue.ts';
import { closeRedisConnection } from '../lib/server/scheduler/redis.ts';

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
after(async () => {
  await closePublicationQueue();
  await closeRedisConnection();
  await closeDb();
});

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

async function seedLibrarySources() {
  await getDb().insert(libraryItems).values([
    { id: 'idempotency-source-a', userId: owner, bodyText: 'Library A' },
    { id: 'idempotency-source-b', userId: owner, bodyText: 'Library B' },
  ]);
}

test('POST accepts a create-only source in the body and same-key same-source retry returns that Post', async () => {
  await seedLibrarySources();
  const body = { ...original, sourceLibraryItemId: 'idempotency-source-a' };
  const first = await POST(request(body));
  assert.equal(first.status, 201);
  const created = await first.json();
  const retry = await POST(request(body));
  assert.equal(retry.status, 201);
  assert.equal((await retry.json()).id, created.id);
  const [stored] = (await getDb().select().from(posts)).filter(post => post.userId === owner);
  assert.equal(stored.sourceLibraryItemId, 'idempotency-source-a');
  assert.equal((await getDb().select().from(libraryItems)).find(item => item.id === 'idempotency-source-a')?.status, 'USED');
  assert.equal((await getDb().select().from(publications)).filter(row => row.userId === owner).length, 1);
});

test('creation key conflicts on changed or removed source even when content is unchanged', async () => {
  await seedLibrarySources();
  assert.equal((await POST(request({ ...original, sourceLibraryItemId: 'idempotency-source-a' }))).status, 201);
  assert.equal((await POST(request({ ...original, sourceLibraryItemId: 'idempotency-source-b' }))).status, 409);
  assert.equal((await POST(request(original))).status, 409);
  assert.equal((await getDb().select().from(libraryItems)).find(item => item.id === 'idempotency-source-b')?.status, 'READY');
  assert.equal((await getDb().select().from(posts)).filter(post => post.userId === owner).length, 1);
});

test('ordinary creation key conflicts when a Library source is added to the same content', async () => {
  await seedLibrarySources();
  assert.equal((await POST(request(original))).status, 201);
  assert.equal((await POST(request({ ...original, sourceLibraryItemId: 'idempotency-source-a' }))).status, 409);
  assert.equal((await getDb().select().from(libraryItems)).find(item => item.id === 'idempotency-source-a')?.status, 'READY');
});

test('changed content under the same key conflicts before a USED source can resolve the existing Post', async () => {
  await seedLibrarySources();
  const body = { ...original, sourceLibraryItemId: 'idempotency-source-a' };
  assert.equal((await POST(request(body))).status, 201);
  assert.equal((await POST(request({ ...body, baseText: 'Changed content' }))).status, 409);
  assert.equal((await getDb().select().from(posts)).filter(post => post.userId === owner).length, 1);
});

test('changed source under a used key conflicts before resolving another already USED source', async () => {
  await seedLibrarySources();
  assert.equal((await POST(request({ ...original, sourceLibraryItemId: 'idempotency-source-a' }))).status, 201);
  const secondKey = '674bb716-4d57-4c2d-ad57-7c74d416a880';
  assert.equal((await POST(request({ ...original, sourceLibraryItemId: 'idempotency-source-b' }, secondKey))).status, 201);
  assert.equal((await POST(request({ ...original, sourceLibraryItemId: 'idempotency-source-b' }))).status, 409);
  assert.equal((await getDb().select().from(posts)).filter(post => post.userId === owner).length, 2);
});

test('a fresh key returning a USED source stays unreserved and preserves canonical creation identity', async () => {
  await seedLibrarySources();
  const body = { ...original, sourceLibraryItemId: 'idempotency-source-a' };
  const firstResponse = await POST(request(body));
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json();
  const [canonical] = (await getDb().select().from(posts)).filter(post => post.userId === owner);
  assert.equal(canonical.creationKey, key);
  assert.ok(canonical.creationInputHash);
  const history = (await getDb().select().from(publications)).filter(row => row.userId === owner);
  const newKey = '674bb716-4d57-4c2d-ad57-7c74d416a880';
  for (let attempt = 0; attempt < 2; attempt++) {
    const replay = await POST(request(body, newKey));
    assert.equal(replay.status, 201);
    assert.equal((await replay.json()).id, first.id);
  }
  const [afterLookup] = (await getDb().select().from(posts)).filter(post => post.userId === owner);
  assert.deepEqual(afterLookup, canonical);
  assert.deepEqual((await getDb().select().from(publications)).filter(row => row.userId === owner), history);
  assert.equal((await getDb().select().from(posts)).filter(post => post.userId === owner).length, 1);
  assert.equal((await getDb().select().from(libraryItems)).find(item => item.id === 'idempotency-source-b')?.status, 'READY');
  assert.equal((await POST(request({ ...body, baseText: 'Changed canonical request' }))).status, 409);
  assert.equal((await POST(request({ ...body, sourceLibraryItemId: 'idempotency-source-b' }))).status, 409);
  const secondResponse = await POST(request({ ...body, sourceLibraryItemId: 'idempotency-source-b' }, newKey));
  assert.equal(secondResponse.status, 201);
  const second = await secondResponse.json();
  assert.notEqual(second.id, first.id);
  const rows = (await getDb().select().from(posts)).filter(post => post.userId === owner);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find(post => post.id === first.id), canonical);
  assert.equal(rows.find(post => post.id === second.id)?.creationKey, newKey);
  assert.equal((await getDb().select().from(libraryItems)).find(item => item.id === 'idempotency-source-b')?.status, 'USED');
});

test('POST missing and foreign Library sources return indistinguishable safe 404 responses', async () => {
  await getDb().insert(users).values({ id: 'idempotency-other', email: 'other-idempotency@example.test', displayName: 'Other' });
  await getDb().insert(libraryItems).values({ id: 'idempotency-foreign-source', userId: 'idempotency-other', bodyText: 'Private' });
  const responses = [];
  for (const sourceLibraryItemId of ['idempotency-foreign-source', 'missing-library-source']) {
    const response = await POST(request({ ...original, sourceLibraryItemId }));
    assert.equal(response.status, 404);
    responses.push(await response.json());
  }
  assert.deepEqual(responses, [{ error: 'Not found' }, { error: 'Not found' }]);
  assert.equal((await getDb().select().from(posts)).filter(post => post.userId === owner).length, 0);
  assert.equal((await getDb().select().from(libraryItems))[0].status, 'READY');
});

test('POST rejects malformed create-only source IDs through existing 422 validation', async () => {
  for (const sourceLibraryItemId of ['', 'x'.repeat(201), 42, null]) {
    assert.equal((await POST(request({ ...original, sourceLibraryItemId }))).status, 422);
  }
  assert.equal((await getDb().select().from(posts)).filter(post => post.userId === owner).length, 0);
});

test('ARCHIVED and orphaned USED sources produce safe client conflicts rather than server errors', async () => {
  await seedLibrarySources();
  await getDb().update(libraryItems).set({ status: 'ARCHIVED' }).where(eq(libraryItems.id, 'idempotency-source-a'));
  const archived = await POST(request({ ...original, sourceLibraryItemId: 'idempotency-source-a' }));
  assert.equal(archived.status, 409);
  assert.equal((await archived.json()).code, 'LIBRARY_SOURCE_CONFLICT');
  const created = await POST(request({ ...original, sourceLibraryItemId: 'idempotency-source-b' }));
  assert.equal(created.status, 201);
  await deletePost(owner, (await created.json()).id);
  const orphaned = await POST(request({ ...original, sourceLibraryItemId: 'idempotency-source-b' }));
  assert.equal(orphaned.status, 409);
  assert.equal((await orphaned.json()).code, 'LIBRARY_SOURCE_CONFLICT');
  assert.equal((await getDb().select().from(libraryItems)).find(item => item.id === 'idempotency-source-b')?.status, 'USED');
  assert.equal((await getDb().select().from(posts)).filter(post => post.userId === owner).length, 0);
});
