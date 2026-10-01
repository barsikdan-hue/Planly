import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getServerEnv } from '@/lib/server/env';
import * as schema from './schema';

type DbGlobals = typeof globalThis & {
  __planlyPool?: Pool;
  __planlyDb?: NodePgDatabase<typeof schema>;
};

const globals = globalThis as DbGlobals;

export function getDb(): NodePgDatabase<typeof schema> {
  if (!globals.__planlyPool) {
    globals.__planlyPool = new Pool({
      connectionString: getServerEnv().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  globals.__planlyDb ??= drizzle(globals.__planlyPool, { schema });
  return globals.__planlyDb;
}

export async function closeDb(): Promise<void> {
  const pool = globals.__planlyPool;
  globals.__planlyDb = undefined;
  globals.__planlyPool = undefined;
  if (pool) await pool.end();
}
