import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { posts, postTargets, publications } from '../../../db/schema.ts';
import { lockOwnerSchedule } from '../planner-slots.ts';

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
  const db = getDb();
  const [identity] = await db.select({ userId: publications.userId, postId: publications.postId })
    .from(publications)
    .where(eq(publications.id, publicationId))
    .limit(1);
  if (!identity) return { scheduled: false };

  return db.transaction(async tx => {
    // Match updatePost's lock order: owner -> Post -> publication history.
    // An edit may have superseded this failure while provider work completed.
    await lockOwnerSchedule(tx, identity.userId);
    const [post] = await tx.select({ status: posts.status }).from(posts)
      .where(and(eq(posts.id, identity.postId), eq(posts.userId, identity.userId))).limit(1).for('update');
    if (!post || post.status !== 'READY') return { scheduled: false };
    const history = await tx.select().from(publications)
      .where(and(eq(publications.postId, identity.postId), eq(publications.userId, identity.userId)))
      .orderBy(asc(publications.id)).for('update');
    const row = history.find(item => item.id === publicationId);
    if (!row || row.status !== 'FAILED' || row.normalizedErrorType !== 'TEMPORARY' ||
      row.providerErrorCode === 'AMBIGUOUS_DELIVERY' || row.attemptCount >= attemptLimit) return { scheduled: false };
    const [target] = await tx.select().from(postTargets)
      .where(and(eq(postTargets.id, row.postTargetId), eq(postTargets.postId, identity.postId))).limit(1);
    if (!target?.active || !target.scheduledAt || target.scheduledAt.getTime() !== row.scheduledAt?.getTime()) return { scheduled: false };
    const superseded = history.some(item => item.id !== row.id && item.postTargetId === row.postTargetId &&
      (item.createdAt >= row.createdAt || ['SCHEDULED', 'QUEUED', 'PUBLISHING', 'PUBLISHED', 'REQUIRES_RECONNECT'].includes(item.status) ||
        item.providerErrorCode === 'AMBIGUOUS_DELIVERY'));
    if (superseded) return { scheduled: false };

    const delayMs = Math.max(
      retryDelayMs(row.attemptCount, delays),
      Number.isFinite(providerDelayMs) ? Math.max(0, Math.min(providerDelayMs, 86_400_000)) : 0,
    );
    await tx.update(publications).set({
      status: 'QUEUED',
      nextRetryAt: new Date(now.getTime() + delayMs),
      updatedAt: now,
    }).where(and(eq(publications.id, publicationId), eq(publications.status, 'FAILED')));
    return { scheduled: true, delayMs };
  });
}
