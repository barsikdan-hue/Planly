import { inArray } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { publications } from '../../../db/schema.ts';
import type { PublicationQueueChange } from '../publications.ts';
import { ensurePublicationJob, removePublicationJob } from './queue.ts';

export type PublicationQueueOperations = {
  ensurePublicationJob(publicationId: string, runAt: Date): Promise<boolean>;
  removePublicationJob(publicationId: string): Promise<boolean | void>;
};

const defaultOperations: PublicationQueueOperations = {
  ensurePublicationJob,
  removePublicationJob,
};

export async function applyPublicationQueueChanges(
  changes: PublicationQueueChange[],
  operations: PublicationQueueOperations = defaultOperations,
): Promise<void> {
  for (const change of changes) {
    if (change.action === 'remove') {
      await operations.removePublicationJob(change.publicationId);
      continue;
    }
    if (!change.runAt) throw new Error('Enqueue publication change requires runAt');
    await operations.ensurePublicationJob(change.publicationId, change.runAt);
  }
}

export async function reconcileScheduledJobs(
  _now = new Date(),
  operations: PublicationQueueOperations = defaultOperations,
): Promise<{ scanned: number; enqueued: number }> {
  const rows = await getDb().select({
    id: publications.id,
    scheduledAt: publications.scheduledAt,
  }).from(publications)
    .where(inArray(publications.status, ['SCHEDULED', 'QUEUED']));

  let enqueued = 0;
  for (const row of rows) {
    if (!row.scheduledAt) continue;
    if (await operations.ensurePublicationJob(row.id, row.scheduledAt)) enqueued += 1;
  }

  return { scanned: rows.filter(row => row.scheduledAt !== null).length, enqueued };
}
