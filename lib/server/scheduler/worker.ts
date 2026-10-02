import { Worker, type Job } from 'bullmq';
import type { ConnectorResolver } from '../connectors/types.ts';
import { processPublication } from './processor.ts';
import { PUBLICATION_MAX_ATTEMPTS, PUBLICATION_QUEUE_NAME, type PublicationJob } from './queue.ts';
import { reconcileScheduledJobs } from './reconcile.ts';
import { DEFAULT_RETRY_DELAYS_MS, prepareTemporaryPublicationRetry, retryDelayMs } from './retry.ts';
import { getRedisConnection } from './redis.ts';

export type PublicationWorkerOptions = {
  retryDelaysMs?: readonly number[];
  reconcileIntervalMs?: number;
};

export type PublicationWorkerRuntime = {
  worker: Worker<PublicationJob>;
  close(): Promise<void>;
};

export async function processPublicationJob(
  job: Job<PublicationJob>,
  resolveConnector?: ConnectorResolver,
  options: PublicationWorkerOptions = {},
): Promise<void> {
  const result = await processPublication(job.data.publicationId, resolveConnector);
  if (result.errorType !== 'TEMPORARY') return;

  const attemptLimit = Number(job.opts.attempts ?? PUBLICATION_MAX_ATTEMPTS);
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const retry = await prepareTemporaryPublicationRetry(job.data.publicationId, attemptLimit, retryDelays, result.retryAfterMs);
  if (!retry.scheduled) return;
  await job.updateData({ ...job.data, retryDelayMs: retry.delayMs });

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
        backoffStrategy: (attemptsMade, _type, _error, job) => job?.data.retryDelayMs ?? retryDelayMs(attemptsMade, retryDelays),
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
