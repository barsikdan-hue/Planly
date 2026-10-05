import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/index.ts';
import { posts, postTargets, publications, socialAccounts } from '../../db/schema.ts';
import { lockOwnerSchedule } from './planner-slots.ts';

export type PublicationQueueChange = {
  publicationId: string;
  action: 'enqueue' | 'remove';
  runAt?: Date;
};

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const openStatuses = new Set(['SCHEDULED', 'QUEUED'] as const);

function sameTime(left: Date | null, right: Date): boolean {
  return left?.getTime() === right.getTime();
}

export async function reconcilePostPublicationsInTx(
  tx: Tx,
  userId: string,
  postId: string,
): Promise<PublicationQueueChange[]> {
  // Existing Post mutations hold owner -> Post -> history locks; createPost
  // holds the owner lock and owns its newly inserted Post/history.
  const [post] = await tx.select({ status: posts.status }).from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId))).limit(1);
  if (!post) throw new Error('Post not found');

  const targetRows = await tx.select({ target: postTargets, account: socialAccounts })
    .from(postTargets)
    .innerJoin(socialAccounts, eq(postTargets.socialAccountId, socialAccounts.id))
    .where(and(eq(postTargets.postId, postId), eq(socialAccounts.userId, userId)));

  const publicationRows = await tx.select().from(publications)
    .where(and(eq(publications.postId, postId), eq(publications.userId, userId)));

  const changes: PublicationQueueChange[] = [];
  const now = new Date();

  for (const { target, account } of targetRows) {
    const targetPublications = publicationRows.filter(row => row.postTargetId === target.id);
    const open = targetPublications.filter(row => openStatuses.has(row.status as 'SCHEDULED' | 'QUEUED'));
    const keep = open[0];

    // Reconciliation makes the edited/replacement lifecycle authoritative in
    // this transaction. Tombstone safe failures before creating/reusing work;
    // preserve their diagnostics, and make stale queue delivery harmless.
    for (const failed of targetPublications.filter(row => row.status === 'FAILED' &&
      row.normalizedErrorType === 'TEMPORARY' && row.providerErrorCode !== 'AMBIGUOUS_DELIVERY')) {
      await tx.update(publications)
        .set({ status: 'CANCELLED', nextRetryAt: null, updatedAt: now })
        .where(eq(publications.id, failed.id));
      changes.push({ publicationId: failed.id, action: 'remove' });
    }

    for (const duplicate of open.slice(1)) {
      await tx.update(publications)
        .set({ status: 'CANCELLED', nextRetryAt: null, updatedAt: now })
        .where(eq(publications.id, duplicate.id));
      changes.push({ publicationId: duplicate.id, action: 'remove' });
    }

    if (post.status !== 'READY' || !target.active || !target.scheduledAt) {
      if (keep) {
        await tx.update(publications)
          .set({ status: 'CANCELLED', nextRetryAt: null, updatedAt: now })
          .where(eq(publications.id, keep.id));
        changes.push({ publicationId: keep.id, action: 'remove' });
      }
      continue;
    }

    if (keep) {
      if (!sameTime(keep.scheduledAt, target.scheduledAt)) {
        await tx.update(publications)
          .set({
            status: 'SCHEDULED',
            scheduledAt: target.scheduledAt,
            nextRetryAt: null,
            normalizedErrorType: null,
            providerErrorCode: null,
            providerErrorMessage: null,
            updatedAt: now,
          })
          .where(eq(publications.id, keep.id));
        changes.push({ publicationId: keep.id, action: 'remove' });
        changes.push({ publicationId: keep.id, action: 'enqueue', runAt: target.scheduledAt });
      }
      continue;
    }

    const hasUnsafeTerminalHistory = targetPublications.some(row =>
      row.status === 'PUBLISHING' || row.status === 'PUBLISHED' || row.status === 'REQUIRES_RECONNECT' ||
      (row.status === 'FAILED' && row.providerErrorCode === 'AMBIGUOUS_DELIVERY'),
    );
    if (hasUnsafeTerminalHistory) continue;

    const publicationId = randomUUID();
    await tx.insert(publications).values({
      id: publicationId,
      userId,
      postId,
      postTargetId: target.id,
      provider: account.provider,
      status: 'SCHEDULED',
      scheduledAt: target.scheduledAt,
      idempotencyKey: `publication:${publicationId}`,
      createdAt: now,
      updatedAt: now,
    });
    changes.push({ publicationId, action: 'enqueue', runAt: target.scheduledAt });
  }

  return changes;
}

export async function reconcilePostPublications(
  userId: string,
  postId: string,
): Promise<PublicationQueueChange[]> {
  return getDb().transaction(async tx => {
    // Match updatePost and retry before reading replacement eligibility.
    await lockOwnerSchedule(tx, userId);
    const [post] = await tx.select({ id: posts.id }).from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId))).limit(1).for('update');
    if (!post) throw new Error('Post not found');
    await tx.select({ id: publications.id }).from(publications)
      .where(and(eq(publications.postId, postId), eq(publications.userId, userId)))
      .orderBy(asc(publications.id)).for('update');
    return reconcilePostPublicationsInTx(tx, userId, postId);
  });
}
