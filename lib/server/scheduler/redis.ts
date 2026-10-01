import Redis from 'ioredis';
import { getRedisEnv } from '../env.ts';

let redisConnection: Redis | undefined;

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    const { REDIS_URL } = getRedisEnv();
    redisConnection = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
  }
  return redisConnection;
}

export async function closeRedisConnection(): Promise<void> {
  const connection = redisConnection;
  redisConnection = undefined;
  if (!connection) return;
  if (connection.status === 'end') return;
  try {
    await connection.quit();
  } catch {
    connection.disconnect();
  }
}
