import { Queue, type JobsOptions } from 'bullmq';
import { getRedisConnection } from './redis.ts';

export const PUBLICATION_QUEUE_NAME = 'planly-publications';
export const PUBLICATION_MAX_ATTEMPTS = 5;
export type PublicationJob = { publicationId: string; retryDelayMs?: number };

let publicationQueue: Queue<PublicationJob> | undefined;

export function buildPublicationJobOptions(
  publicationId: string,
  runAt: Date,
  now = Date.now(),
): JobsOptions {
  return {
    jobId: publicationId,
    delay: Math.max(0, runAt.getTime() - now),
    attempts: PUBLICATION_MAX_ATTEMPTS,
    backoff: { type: 'custom', delay: 0 },
    removeOnComplete: true,
    removeOnFail: false,
  };
}

export function getPublicationQueue(): Queue<PublicationJob> {
  publicationQueue ??= new Queue<PublicationJob>(PUBLICATION_QUEUE_NAME, {
    connection: getRedisConnection(),
  });
  return publicationQueue;
}

export async function ensurePublicationJob(publicationId: string, runAt: Date): Promise<boolean> {
  const queue = getPublicationQueue();
  const existing = await queue.getJob(publicationId);
  const desiredRunAt = runAt.getTime();

  if (existing) {
    const currentRunAt = existing.timestamp + Number(existing.opts.delay ?? 0);
    if (currentRunAt === desiredRunAt) return false;
    await existing.remove();
  }

  await queue.add(
    'publish',
    { publicationId },
    buildPublicationJobOptions(publicationId, runAt),
  );
  return true;
}

export async function enqueuePublication(publicationId: string, runAt: Date): Promise<void> {
  await ensurePublicationJob(publicationId, runAt);
}

export async function removePublicationJob(publicationId: string): Promise<void> {
  const job = await getPublicationQueue().getJob(publicationId);
  if (job) await job.remove();
}

export async function closePublicationQueue(): Promise<void> {
  const queue = publicationQueue;
  publicationQueue = undefined;
  if (queue) await queue.close();
}
