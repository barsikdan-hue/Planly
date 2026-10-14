import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
const testDatabase=new URL(process.env.DATABASE_URL!);
assert.ok(['127.0.0.1','localhost'].includes(testDatabase.hostname) && testDatabase.pathname==='/planly_test','Disposable native test database required');

after(closeDb);
test('multiuser auth persistence defaults fail closed without replacing legacy user IDs', async () => {
  const db = getDb();
  const columns = await db.execute<{ column_name: string }>(sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users'`);
  for (const name of ['role', 'access_state', 'password_hash', 'auth_initialized', 'session_version']) {
    assert.ok(columns.rows.some(column => column.column_name === name), `Missing auth column ${name}`);
  }
  await db.execute(sql`INSERT INTO users(id,email,display_name) VALUES ('schema-auth-legacy','schema-auth@example.test','Legacy')`);
  try {
    const result = await db.execute<{ id: string; role: string; access_state: string; password_hash: string | null; auth_initialized: boolean; session_version: number }>(sql`SELECT id,role,access_state,password_hash,auth_initialized,session_version FROM users WHERE id='schema-auth-legacy'`);
    assert.deepEqual(result.rows[0], { id: 'schema-auth-legacy', role: 'USER', access_state: 'BLOCKED', password_hash: null, auth_initialized: false, session_version: 0 });
  } finally { await db.execute(sql`DELETE FROM users WHERE id='schema-auth-legacy'`); }
});
