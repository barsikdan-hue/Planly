import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getServerEnv } from '../lib/server/env.ts';
import * as schema from './schema.ts';

type DbGlobals = typeof globalThis & {
  __planlyPool?: Pool;
  __planlyDb?: NodePgDatabase<typeof schema>;
  __planlyPublicationLockPool?: Pool;
};

const globals = globalThis as DbGlobals;

export function getPool(): Pool {
  if (!globals.__planlyPool) {
    globals.__planlyPool = new Pool({
      connectionString: getServerEnv().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return globals.__planlyPool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  globals.__planlyDb ??= drizzle(getPool(), { schema });
  return globals.__planlyDb;
}

// Long provider IO must not reserve every connection needed by ordinary queries.
// Dedicated, bounded session leases also release automatically after process loss.
export function getPublicationLockPool(): Pool {
  globals.__planlyPublicationLockPool ??= new Pool({
    connectionString: getServerEnv().DATABASE_URL,
    max: 2, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000,
  });
  return globals.__planlyPublicationLockPool;
}

export async function closeDb(): Promise<void> {
  const pool = globals.__planlyPool;
  const lockPool = globals.__planlyPublicationLockPool;
  globals.__planlyDb = undefined;
  globals.__planlyPool = undefined;
  globals.__planlyPublicationLockPool = undefined;
  if (pool) await pool.end();
  if (lockPool) await lockPool.end();
}
