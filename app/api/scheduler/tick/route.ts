import { timingSafeEqual } from 'node:crypto';
import { json } from '../../../../lib/server/http.ts';
import { runDuePublications } from '../../../../lib/server/scheduler/tick.ts';

const DEFAULT_LIMIT = 10;

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

function authorized(request: Request): boolean {
  const expected = process.env.SCHEDULER_TICK_SECRET;
  const actual = bearerToken(request);
  if (!expected || !actual) return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return json({ error: 'Unauthorized' }, 401);
  return json(await runDuePublications({ limit: DEFAULT_LIMIT }));
}
