import { closeDb } from '../db/index.ts';
import { closePublicationQueue } from '../lib/server/scheduler/queue.ts';
import { closeRedisConnection } from '../lib/server/scheduler/redis.ts';
import { startPublicationWorker } from '../lib/server/scheduler/worker.ts';

const runtime = await startPublicationWorker();
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info('Planly worker shutting down', { signal });
  try {
    await runtime.close();
    await closePublicationQueue();
    await closeRedisConnection();
    await closeDb();
    process.exitCode = 0;
  } catch (error) {
    console.error('Planly worker shutdown failed', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  }
}

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
console.info('Planly publication worker started');
