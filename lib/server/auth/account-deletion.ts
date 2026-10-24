import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { accountDeletionTasks, mediaAssets, mediaUploadIntents, publications, userInvitations, users } from '../../../db/schema.ts';
import type { AuthTransaction } from './admin.ts';
import { getObjectStorage, type ObjectStorage } from '../storage.ts';
import { getPublicationQueue } from '../scheduler/queue.ts';

export class AccountDeletionConflictError extends Error {}
// Caller holds ADMIN then eligible target USER locks and has confirmed its email.
export async function prepareAccountDeletion(tx: AuthTransaction, userId: string, email: string) {
  const [upload] = await tx.select({ id: mediaUploadIntents.id }).from(mediaUploadIntents).where(eq(mediaUploadIntents.userId, userId)).limit(1);
  if (upload) throw new AccountDeletionConflictError('Загрузка или очистка медиа ещё не завершена. Дождитесь результата; при неизвестном исходе нужна проверка хранилища.');
  const [unsafe] = await tx.select({ id: publications.id }).from(publications).where(and(eq(publications.userId, userId), or(
    eq(publications.status, 'PUBLISHING'), and(eq(publications.status, 'FAILED'), eq(publications.providerErrorCode, 'AMBIGUOUS_DELIVERY')),
  ))).limit(1);
  if (unsafe) throw new AccountDeletionConflictError('Сначала подтвердите результат выполняющейся или неопределённой публикации.');
  const assets = await tx.select({ key: mediaAssets.storageKey }).from(mediaAssets).where(eq(mediaAssets.userId, userId)).for('update');
  const storageKeys = [...new Set(assets.map(asset => asset.key))];
  if (storageKeys.length) {
    const [foreign] = await tx.select({ id: mediaAssets.id }).from(mediaAssets).where(and(ne(mediaAssets.userId, userId), inArray(mediaAssets.storageKey, storageKeys))).limit(1);
    if (foreign) throw new AccountDeletionConflictError('Принадлежность медиа требует проверки. Удаление остановлено.');
  }
  const rows = await tx.select({ id: publications.id }).from(publications).where(eq(publications.userId, userId));
  const deletionId = randomUUID();
  await tx.insert(accountDeletionTasks).values({ id: deletionId, userId, storageKeys, publicationIds: rows.map(row => row.id) });
  await tx.delete(userInvitations).where(sql`lower(trim(${userInvitations.email})) = ${email.trim().toLowerCase()}`);
  await tx.delete(users).where(eq(users.id, userId));
  return { deleted: true, cleanupPending: true, deletionId };
}
type QueueCleanup = (changes: { publicationId: string; action: 'remove' }[]) => Promise<void>;
async function removeDeletionJobs(changes: { publicationId: string }[]) {
  const queue = getPublicationQueue();
  for (const { publicationId } of changes) {
    const job = await queue.getJob(publicationId);
    if (job) {
      if (await job.getState() === 'active') throw new Error('Deletion job still active');
      await job.remove();
    }
    if (await queue.getJob(publicationId)) throw new Error('Deletion job absence unconfirmed');
  }
}
export async function processAccountDeletionTasks(storage?: ObjectStorage, queueCleanup: QueueCleanup = removeDeletionJobs): Promise<number> {
  const tasks = await getDb().select().from(accountDeletionTasks).limit(20);
  let completed = 0;
  for (const task of tasks) {
    try {
      // Object deletion and queue removal are idempotent. A failed attempt leaves
      // the complete durable task for the next worker reconciliation.
      if (task.storageKeys.length) {
        const targetStorage = storage ?? getObjectStorage();
        for (const key of task.storageKeys) await targetStorage.delete(key);
      }
      if (task.publicationIds.length) await queueCleanup(task.publicationIds.map(publicationId => ({ publicationId, action: 'remove' as const })));
      await getDb().delete(accountDeletionTasks).where(eq(accountDeletionTasks.id, task.id));
      completed++;
    } catch {
      // Never print private object keys or provider/storage responses.
      console.warn('Account deletion cleanup pending');
    }
  }
  return completed;
}
