import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { publications } from '../../../db/schema.ts';
import type { ConnectorResolver } from '../connectors/types.ts';
import { processPublication } from './processor.ts';
import { PUBLICATION_MAX_ATTEMPTS, PUBLICATION_QUEUE_NAME, type PublicationJob } from './queue.ts';
import { reconcileScheduledJobs } from './reconcile.ts';
import { getRedisConnection } from './redis.ts';

export const DEFAULT_RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000] as const;

export type PublicationWorkerOptions = {
  retryDelaysMs?: readonly number[];
  reconcileIntervalMs?: number;
};

export type PublicationWorkerRuntime = {
  worker: Worker<PublicationJob>;
  close(): Promise<void>;
};

export function retryDelayMs(attemptCount: number, delays: readonly number[] = DEFAULT_RETRY_DELAYS_MS): number {
  if (!delays.length) return 0;
  const index = Math.max(0, Math.min(attemptCount - 1, delays.length - 1));
  return delays[index] ?? 0;
}

async function prepareTemporaryRetry(
  publicationId: string,
  attemptLimit: number,
  delays: readonly number[],
): Promise<boolean> {
  const [row] = await getDb().select({ attemptCount: publications.attemptCount })
    .from(publications)
    .where(eq(publications.id, publicationId))
    .limit(1);
  if (!row || row.attemptCount >= attemptLimit) return false;

  const delay = retryDelayMs(row.attemptCount, delays);
  await getDb().update(publications).set({
    status: 'QUEUED',
    nextRetryAt: new Date(Date.now() + delay),
    updatedAt: new Date(),
  }).where(eq(publications.id, publicationId));
  return true;
}

export async function processPublicationJob(
  job: Job<PublicationJob>,
  resolveConnector?: ConnectorResolver,
  options: PublicationWorkerOptions = {},
): Promise<void> {
  const result = await processPublication(job.data.publicationId, resolveConnector);
  if (result.errorType !== 'TEMPORARY') return;

  const attemptLimit = Number(job.opts.attempts ?? PUBLICATION_MAX_ATTEMPTS);
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  if (!await prepareTemporaryRetry(job.data.publicationId, attemptLimit, retryDelays)) return;

  throw new Error('Temporary publication failure; retry scheduled');
}

export async function startPublicationWorker(
  resolveConnector?: ConnectorResolver,
  options: PublicationWorkerOptions = {},
): Promise<PublicationWorkerRuntime> {
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  await reconcileScheduledJobs();

  const worker = new Worker<PublicationJob>(
    PUBLICATION_QUEUE_NAME,
    job => processPublicationJob(job, resolveConnector, options),
    {
      connection: getRedisConnection(),
      settings: {
        backoffStrategy: attemptsMade => retryDelayMs(attemptsMade, retryDelays),
      },
    },
  );

  let interval: ReturnType<typeof setInterval> | undefined;
  const reconcileIntervalMs = options.reconcileIntervalMs ?? 60_000;
  if (reconcileIntervalMs > 0) {
    interval = setInterval(() => {
      void reconcileScheduledJobs().catch(error => {
        console.error('Scheduler reconciliation failed', error instanceof Error ? error.message : 'unknown error');
      });
    }, reconcileIntervalMs);
    interval.unref?.();
  }

  return {
    worker,
    async close() {
      if (interval) clearInterval(interval);
      await worker.close();
    },
  };
}
