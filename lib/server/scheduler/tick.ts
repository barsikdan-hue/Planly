import { and, asc, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { publications } from '../../../db/schema.ts';
import type { ConnectorResolver } from '../connectors/types.ts';
import { processPublication } from './processor.ts';
import { PUBLICATION_MAX_ATTEMPTS } from './queue.ts';
import { DEFAULT_RETRY_DELAYS_MS, prepareTemporaryPublicationRetry } from './retry.ts';

export type SchedulerTickResult = {
  scanned: number;
  processed: number;
  published: number;
  skipped: number;
  failed: number;
};

type RunDuePublicationsOptions = {
  now?: Date;
  limit?: number;
  attemptLimit?: number;
  retryDelaysMs?: readonly number[];
  resolveConnector?: ConnectorResolver;
};

function emptyResult(): SchedulerTickResult {
  return { scanned: 0, processed: 0, published: 0, skipped: 0, failed: 0 };
}

export async function runDuePublications(options: RunDuePublicationsOptions = {}): Promise<SchedulerTickResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 10;
  const attemptLimit = options.attemptLimit ?? PUBLICATION_MAX_ATTEMPTS;
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const rows = await getDb().select({ id: publications.id }).from(publications)
    .where(and(
      inArray(publications.status, ['SCHEDULED', 'QUEUED']),
      isNotNull(publications.scheduledAt),
      lte(publications.scheduledAt, now),
      or(isNull(publications.nextRetryAt), lte(publications.nextRetryAt, now)),
    ))
    .orderBy(asc(publications.scheduledAt), asc(publications.id))
    .limit(limit);

  const result = emptyResult();
  result.scanned = rows.length;
  for (const row of rows) {
    const publication = await processPublication(row.id, options.resolveConnector);
    result.processed += 1;
    if (publication.errorType === 'TEMPORARY') {
      const retry = await prepareTemporaryPublicationRetry(row.id, attemptLimit, retryDelays, publication.retryAfterMs, now);
      if (retry.scheduled) continue;
    }
    if (publication.skipped) result.skipped += 1;
    else if (publication.status === 'PUBLISHED') result.published += 1;
    else if (publication.status === 'FAILED' || publication.status === 'REQUIRES_RECONNECT') result.failed += 1;
  }
  return result;
}
