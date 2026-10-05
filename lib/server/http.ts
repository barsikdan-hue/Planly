import { ZodError } from 'zod';
import { UnauthorizedError } from './auth/owner.ts';
import { PublicationContentError } from '../publication-content.ts';
import { CreationConflictError } from './post-idempotency.ts';
import { PostEditConflictError } from './post-editability.ts';
import { LibrarySourceConflictError } from './library-conversion-error.ts';
import { LibrarySourceStaleError, PlannerAccountUnavailableError, PlannerSlotConflictError } from './planner-slots.ts';

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function apiError(error: unknown): Response {
  if (error instanceof UnauthorizedError) return json({ error: 'Unauthorized' }, 401);
  if (error instanceof SyntaxError) return json({ error: 'Malformed JSON' }, 400);
  if (error instanceof ZodError) return json({ error: 'Validation failed', issues: error.issues }, 422);
  if (error instanceof PublicationContentError) return json({ error: error.message, code: error.code }, 422);
  if (error instanceof CreationConflictError) return json({ error: error.message, code: 'CREATION_KEY_CONFLICT' }, 409);
  if (error instanceof PostEditConflictError) return json({ error: error.message, code: 'POST_EDIT_BLOCKED' }, 409);
  if (error instanceof LibrarySourceConflictError) return json({ error: error.message, code: 'LIBRARY_SOURCE_CONFLICT' }, 409);
  if (error instanceof LibrarySourceStaleError) return json({ error: error.message, code: 'LIBRARY_SOURCE_STALE' }, 409);
  if (error instanceof PlannerSlotConflictError) return json({ error: error.message, code: 'PLANNER_SLOT_CONFLICT' }, 409);
  if (error instanceof PlannerAccountUnavailableError) return json({ error: error.message, code: 'PLANNER_ACCOUNT_UNAVAILABLE' }, 422);
  if (error instanceof Error && /not found/i.test(error.message)) return json({ error: 'Not found' }, 404);
  console.error('API request failed', error instanceof Error ? error.message : 'unknown error');
  return json({ error: 'Internal server error' }, 500);
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json();
}
