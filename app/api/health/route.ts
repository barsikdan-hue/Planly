import { sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';

function errorDetails(error: unknown): { name: string; code?: string } {
  if (!(error instanceof Error)) return { name: 'UnknownError' };

  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return code ? { name: error.name, code } : { name: error.name };
}

export async function GET(): Promise<Response> {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: 'ok' });
  } catch (error) {
    console.error('[health] database probe failed', errorDetails(error));
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
