import assert from 'node:assert/strict';
import test from 'node:test';

import { getRedisEnv, resetServerEnvForTests } from '../lib/server/env.ts';
import { buildPublicationJobOptions, type PublicationJob } from '../lib/server/scheduler/queue.ts';

test('publication job options use publication id as stable BullMQ jobId', () => {
  const payload: PublicationJob = { publicationId: 'pub-123' };
  const options = buildPublicationJobOptions(payload.publicationId, new Date('2026-10-01T12:05:00.000Z'), Date.parse('2026-10-01T12:00:00.000Z'));

  assert.equal(options.jobId, 'pub-123');
  assert.equal(options.delay, 300_000);
});

test('publication delay is never negative for overdue work', () => {
  const options = buildPublicationJobOptions('pub-overdue', new Date('2026-10-01T11:59:00.000Z'), Date.parse('2026-10-01T12:00:00.000Z'));
  assert.equal(options.delay, 0);
});

test('redis configuration errors never echo the REDIS_URL value', () => {
  const previous = process.env.REDIS_URL;
  process.env.REDIS_URL = 'definitely-not-a-url-secret-marker';
  resetServerEnvForTests();

  try {
    assert.throws(
      () => getRedisEnv(),
      (error: unknown) => {
        const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        assert.equal(text.includes('secret-marker'), false);
        return true;
      },
    );
  } finally {
    if (previous === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previous;
    resetServerEnvForTests();
  }
});
