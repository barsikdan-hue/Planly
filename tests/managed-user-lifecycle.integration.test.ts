import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { getDb, closeDb } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { owner, other, admin, token, seedBatchFixture } from './helpers/library-batch-db.ts';
import { changeManagedUserAccess } from '../lib/server/auth/user-management.ts';
import { consumePasswordReset } from '../lib/server/auth/password-reset.ts';
import { processAccountDeletionTasks } from '../lib/server/auth/account-deletion.ts';
import { getOwnerBySessionToken } from '../lib/server/auth/session.ts';
import { verifyOwnerPassword } from '../lib/server/auth/password.ts';
import { createLibraryItem } from '../lib/server/library-items.ts';
import { createPost } from '../lib/server/posts.ts';
import { observePublicationAuthorization } from '../lib/server/social-connections/publication-authorization.ts';
import { createMediaAsset, processPendingMediaCleanup } from '../lib/server/media.ts';
const isolated = new URL(process.env.DATABASE_URL!);
assert.ok(['127.0.0.1', 'localhost'].includes(isolated.hostname) && isolated.pathname === '/planly_test');
const db = getDb();
function request(body: unknown, actor = admin) { return new Request(`http://planly.test/api/admin/users/${owner}`, { method: 'POST', headers: { cookie: `planly_session=${token(actor)}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
async function action(body: unknown, actor = admin) { return changeManagedUserAccess(request(body, actor), owner); }
beforeEach(async () => { await db.delete(schema.accountDeletionTasks); await seedBatchFixture(); });
after(async () => { await db.delete(schema.accountDeletionTasks); await db.delete(schema.users); await closeDb(); });
test('manual deadline preserves reads and block state while enforcing direct writes and USER provider authorization', async () => {
  await action({ action: 'expire', expiresAt: '2000-01-01T00:00:00Z' });
  assert.ok(await getOwnerBySessionToken(token(owner)), 'expiry is not administrative blocking');
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, owner));
  assert.equal(user.sessionVersion, 1);
  await assert.rejects(createLibraryItem(owner, { title: 'No new content', text: 'Expired', mediaIds: [] }));
  assert.equal(await observePublicationAuthorization(owner, `${owner}-MAX`, { socialBindingRevision: 1, socialBindingDestinationId: '-101' }), null);
  await action({ action: 'block' });
  await action({ action: 'unlimited' });
  const [blocked] = await db.select().from(schema.users).where(eq(schema.users.id, owner));
  assert.equal(blocked.accessState, 'BLOCKED');
  assert.equal(blocked.accessExpiresAt, null);
});
test('reset tokens are hashed, replaced and single-use; reset revokes sessions without escalating roles', async () => {
  const first = await action({ action: 'reset-password' });
  assert.ok('resetToken' in first);
  const second = await action({ action: 'reset-password' });
  assert.ok('resetToken' in second);
  const rows = await db.select().from(schema.passwordResetTokens);
  assert.equal(rows.length, 1);
  assert.equal(JSON.stringify(rows).includes(second.resetToken), false);
  await assert.rejects(consumePasswordReset({ token: first.resetToken, password: 'new-password-12345' }));
  await consumePasswordReset({ token: second.resetToken, password: 'new-password-12345' });
  await assert.rejects(consumePasswordReset({ token: second.resetToken, password: 'another-password-12345' }));
  assert.equal(await getOwnerBySessionToken(token(owner)), null);
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, owner));
  assert.equal(user.role, 'USER'); assert.equal(user.accessState, 'ACTIVE');
  assert.ok(await verifyOwnerPassword('new-password-12345', user.passwordHash!));
});
test('expired and concurrently consumed reset capabilities cannot reset twice', async () => {
  const issued = await action({ action: 'reset-password' }); assert.ok('resetToken' in issued);
  await db.update(schema.passwordResetTokens).set({ expiresAt: new Date(0) });
  await assert.rejects(consumePasswordReset({ token: issued.resetToken, password: 'new-password-12345' }));
  const fresh = await action({ action: 'reset-password' }); assert.ok('resetToken' in fresh);
  const results = await Promise.allSettled([1, 2].map(() => consumePasswordReset({ token: fresh.resetToken, password: 'new-password-12345' })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
});
test('deletion is email-confirmed, removes USER data and retains durable cleanup on storage failure', async () => {
  await assert.rejects(action({ action: 'delete', confirmedEmail: 'wrong@example.test' }));
  await assert.rejects(action({ action: 'delete', confirmedEmail: `${owner}@example.test` }, other));
  const outcome = await action({ action: 'delete', confirmedEmail: `${owner}@example.test` });
  assert.ok('cleanupPending' in outcome && outcome.cleanupPending);
  assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, owner))).length, 0);
  assert.equal(await getOwnerBySessionToken(token(owner)), null);
  assert.equal((await db.select().from(schema.libraryItems).where(eq(schema.libraryItems.userId, owner))).length, 0);
  assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, other))).length, 1);
  const failedStorage = { put: async () => {}, signedGetUrl: async () => '', delete: async () => { throw new Error('synthetic storage failure'); } };
  assert.equal(await processAccountDeletionTasks(failedStorage, async () => {}), 0);
  assert.equal((await db.select().from(schema.accountDeletionTasks)).length, 1);
  const removed: string[] = [];
  assert.equal(await processAccountDeletionTasks({ ...failedStorage, delete: async key => { removed.push(key); } }, async () => {}), 1);
  assert.deepEqual(removed, ['batch-media']);
  assert.equal((await db.select().from(schema.accountDeletionTasks)).length, 0);
});
test('an in-flight or ambiguous provider result blocks destructive account deletion', async () => {
  const post = await createPost(owner, { baseText: 'In flight', status: 'READY', mediaIds: [], targets: [{ provider: 'max', scheduledAt: '2030-01-01T07:00:00Z', textOverride: null }] }, { mirrorQueue: async () => {} });
  await db.update(schema.publications).set({ status: 'PUBLISHING' }).where(eq(schema.publications.postId, post.id));
  await assert.rejects(action({ action: 'delete', confirmedEmail: `${owner}@example.test` }));
  await db.update(schema.publications).set({ status: 'FAILED', providerErrorCode: 'AMBIGUOUS_DELIVERY' }).where(eq(schema.publications.postId, post.id));
  await assert.rejects(action({ action: 'delete', confirmedEmail: `${owner}@example.test` }));
  assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, owner))).length, 1);
  assert.equal((await db.select().from(schema.accountDeletionTasks)).length, 0);
});

test('deletion waits for in-flight upload and durable compensation survives storage failure', async () => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  const keys: string[] = [];
  const storage = {
    put: async (key: string) => { keys.push(key); entered(); await hold; },
    delete: async () => { throw new Error('synthetic delete unavailable'); }, signedGetUrl: async () => '',
  };
  const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
  const upload = createMediaAsset(owner, new File([png], 'race.png', { type: 'image/png' }), storage);
  // Attach the rejection handler before releasing the controlled IO.
  const outcome = upload.then(() => null, error => error);
  try {
    await started;
    await assert.rejects(action({ action: 'delete', confirmedEmail: `${owner}@example.test` }), /загруз/i);
    assert.equal((await db.select().from(schema.accountDeletionTasks)).length, 0);
    await action({ action: 'expire', expiresAt: '2000-01-01T00:00:00Z' });
  } finally { release(); }
  assert.ok(await outcome instanceof Error);
  const [pending] = await db.select().from(schema.mediaUploadIntents);
  assert.equal(pending.storageKey, keys[0]); assert.equal(pending.cleanupReady, true);
  await assert.rejects(action({ action: 'delete', confirmedEmail: `${owner}@example.test` }), /загруз/i);
  assert.equal(await processPendingMediaCleanup(storage), 0);
  const removed: string[] = [];
  assert.equal(await processPendingMediaCleanup({ ...storage, delete: async key => { removed.push(key); } }), 1);
  assert.deepEqual(removed, keys);
  assert.equal((await db.select().from(schema.mediaUploadIntents)).length, 0);
  assert.ok('deleted' in await action({ action: 'delete', confirmedEmail: `${owner}@example.test` }));
});
