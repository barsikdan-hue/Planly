import { eq } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { publications } from '../../../db/schema.ts';

export const DEFAULT_RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000] as const;

export function retryDelayMs(attemptCount: number, delays: readonly number[] = DEFAULT_RETRY_DELAYS_MS): number {
  if (!delays.length) return 0;
  const index = Math.max(0, Math.min(attemptCount - 1, delays.length - 1));
  return delays[index] ?? 0;
}

export async function prepareTemporaryPublicationRetry(
  publicationId: string,
  attemptLimit: number,
  delays: readonly number[],
  providerDelayMs = 0,
  now = new Date(),
): Promise<{ scheduled: boolean; delayMs?: number }> {
  const [row] = await getDb().select({ attemptCount: publications.attemptCount })
    .from(publications)
    .where(eq(publications.id, publicationId))
    .limit(1);
  if (!row || row.attemptCount >= attemptLimit) return { scheduled: false };

  const delayMs = Math.max(
    retryDelayMs(row.attemptCount, delays),
    Number.isFinite(providerDelayMs) ? Math.max(0, Math.min(providerDelayMs, 86_400_000)) : 0,
  );
  await getDb().update(publications).set({
    status: 'QUEUED',
    nextRetryAt: new Date(now.getTime() + delayMs),
    updatedAt: now,
  }).where(eq(publications.id, publicationId));
  return { scheduled: true, delayMs };
}
