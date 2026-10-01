import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { loginRateLimits, sessions, users } from '../db/schema.ts';
import { authenticateOwner, ensureOwner } from '../lib/server/auth/owner.ts';
import {
  createOwnerSession,
  deleteSessionByToken,
  getOwnerBySessionToken,
} from '../lib/server/auth/session.ts';
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from '../lib/server/auth/rate-limit.ts';

beforeEach(async () => {
  await getDb().delete(sessions);
});

after(async () => {
  await closeDb();
});

test('owner login accepts configured credentials and rejects wrong credentials', async () => {
  assert.ok(await authenticateOwner(' OWNER@example.test ', 'ci-test-owner-password'));
  assert.equal(await authenticateOwner('owner@example.test', 'wrong-password'), null);
  assert.equal(await authenticateOwner('other@example.test', 'ci-test-owner-password'), null);
});

test('session stores only a hash and rejects forged, expired and invalidated tokens', async () => {
  const db = getDb();
  const owner = await ensureOwner();
  const rawToken = await createOwnerSession(owner.id);
  assert.ok(rawToken.length >= 40);

  const [stored] = await db.select().from(sessions).where(eq(sessions.userId, owner.id));
  assert.ok(stored);
  assert.notEqual(stored.tokenHash, rawToken);
  assert.equal((await getOwnerBySessionToken(rawToken))?.id, owner.id);
  assert.equal(await getOwnerBySessionToken(`forged-${rawToken}`), null);

  await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(sessions.id, stored.id));
  assert.equal(await getOwnerBySessionToken(rawToken), null);

  const secondToken = await createOwnerSession(owner.id);
  assert.equal((await getOwnerBySessionToken(secondToken))?.id, owner.id);
  await deleteSessionByToken(secondToken);
  assert.equal(await getOwnerBySessionToken(secondToken), null);
});

test('another database user cannot receive an owner session', async () => {
  const db = getDb();
  const suffix = randomUUID();
  const otherId = `other-${suffix}`;
  await db.insert(users).values({ id: otherId, email: `${suffix}@other.test`, displayName: 'Other' });
  await assert.rejects(createOwnerSession(otherId));
  await db.delete(users).where(eq(users.id, otherId));
});

test('persistent login rate limit blocks the sixth attempt and clears after success', async () => {
  const db = getDb();
  const fingerprint = `test-${randomUUID()}`;
  assert.equal((await checkLoginRateLimit(fingerprint)).allowed, true);

  for (let i = 0; i < 5; i += 1) await recordLoginFailure(fingerprint);
  const blocked = await checkLoginRateLimit(fingerprint);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 15 * 60);

  await clearLoginFailures(fingerprint);
  assert.equal((await checkLoginRateLimit(fingerprint)).allowed, true);

  await db.delete(loginRateLimits);
});
