import { ZodError } from 'zod';
import { UnauthorizedError } from './auth/owner.ts';

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function apiError(error: unknown): Response {
  if (error instanceof UnauthorizedError) return json({ error: 'Unauthorized' }, 401);
  if (error instanceof SyntaxError) return json({ error: 'Malformed JSON' }, 400);
  if (error instanceof ZodError) {
    console.error('API validation failed', error.issues.map(issue => ({ path: issue.path.join('.'), code: issue.code })));
    return json({ error: 'Validation failed', issues: error.issues }, 422);
  }
  if (error instanceof Error && /not found/i.test(error.message)) return json({ error: 'Not found' }, 404);
  console.error('API request failed', error instanceof Error ? error.message : 'unknown error');
  return json({ error: 'Internal server error' }, 500);
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json();
}
