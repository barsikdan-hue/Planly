import { Queue, type JobsOptions } from 'bullmq';
import { getRedisConnection } from './redis.ts';

export const PUBLICATION_QUEUE_NAME = 'planly-publications';
export type PublicationJob = { publicationId: string };

let publicationQueue: Queue<PublicationJob> | undefined;

export function buildPublicationJobOptions(
  publicationId: string,
  runAt: Date,
  now = Date.now(),
): JobsOptions {
  return {
    jobId: publicationId,
    delay: Math.max(0, runAt.getTime() - now),
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

export async function enqueuePublication(publicationId: string, runAt: Date): Promise<void> {
  await getPublicationQueue().add(
    'publish',
    { publicationId },
    buildPublicationJobOptions(publicationId, runAt),
  );
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
