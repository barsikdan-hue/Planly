import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { loginRateLimits } from '../../../db/schema.ts';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

function keyHash(fingerprint: string): string {
  return createHash('sha256').update(fingerprint || 'unknown').digest('hex');
}

export async function checkLoginRateLimit(
  fingerprint: string,
  now = new Date(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const hash = keyHash(fingerprint);
  const [row] = await getDb().select().from(loginRateLimits).where(eq(loginRateLimits.keyHash, hash)).limit(1);
  if (!row) return { allowed: true, retryAfterSeconds: 0 };

  const endsAt = row.windowStartedAt.getTime() + WINDOW_MS;
  if (endsAt <= now.getTime()) {
    await getDb().delete(loginRateLimits).where(eq(loginRateLimits.keyHash, hash));
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (row.failedCount < MAX_FAILURES) return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((endsAt - now.getTime()) / 1000)),
  };
}

export async function recordLoginFailure(fingerprint: string, now = new Date()): Promise<void> {
  const hash = keyHash(fingerprint);
  const cutoff = new Date(now.getTime() - WINDOW_MS);
  await getDb()
    .insert(loginRateLimits)
    .values({ keyHash: hash, failedCount: 1, windowStartedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: loginRateLimits.keyHash,
      set: {
        failedCount: sql<number>`case when ${loginRateLimits.windowStartedAt} <= ${cutoff} then 1 else ${loginRateLimits.failedCount} + 1 end`,
        windowStartedAt: sql<Date>`case when ${loginRateLimits.windowStartedAt} <= ${cutoff} then ${now} else ${loginRateLimits.windowStartedAt} end`,
        updatedAt: now,
      },
    });
}

export async function clearLoginFailures(fingerprint: string): Promise<void> {
  await getDb().delete(loginRateLimits).where(eq(loginRateLimits.keyHash, keyHash(fingerprint)));
}
