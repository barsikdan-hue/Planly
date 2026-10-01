import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { loginRateLimits, sessions, users } from '../db/schema.ts';
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

after(async () => {
  await closeDb();
});

test('session stores only a hash and rejects forged, expired and invalidated tokens', async () => {
  const db = getDb();
  const suffix = randomUUID();
  const userId = `auth-${suffix}`;
  await db.insert(users).values({ id: userId, email: `${suffix}@auth.test`, displayName: 'Owner' });

  const rawToken = await createOwnerSession(userId);
  assert.ok(rawToken.length >= 40);

  const [stored] = await db.select().from(sessions).where(eq(sessions.userId, userId));
  assert.ok(stored);
  assert.notEqual(stored.tokenHash, rawToken);
  assert.equal((await getOwnerBySessionToken(rawToken))?.id, userId);
  assert.equal(await getOwnerBySessionToken(`forged-${rawToken}`), null);

  await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(sessions.id, stored.id));
  assert.equal(await getOwnerBySessionToken(rawToken), null);

  const secondToken = await createOwnerSession(userId);
  assert.equal((await getOwnerBySessionToken(secondToken))?.id, userId);
  await deleteSessionByToken(secondToken);
  assert.equal(await getOwnerBySessionToken(secondToken), null);

  await db.delete(users).where(eq(users.id, userId));
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
