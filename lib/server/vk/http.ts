import { ZodError } from 'zod';
import { UnauthorizedError } from '../auth/owner.ts';
import { json } from '../http.ts';
import { VkOAuthError } from './config.ts';

export function vkApiError(error: unknown): Response {
  if (error instanceof UnauthorizedError) return json({ error: 'Unauthorized' }, 401);
  if (error instanceof SyntaxError) return json({ error: 'Malformed JSON' }, 400);
  if (error instanceof ZodError) return json({ error: 'Validation failed' }, 422);
  if (error instanceof VkOAuthError) {
    const status = error.code === 'CONFIG' ? 503 : error.code === 'NOT_FOUND' ? 404 : 422;
    return json({ error: error.code === 'CONFIG' ? 'VK setup is required.' : 'VK authorization could not be confirmed. Reconnect through VK ID.', code: error.code }, status);
  }
  // Never log transport, database or credential exceptions from OAuth requests.
  return json({ error: 'VK request could not be completed.' }, 500);
}

export function requireVkSameOrigin(request: Request, configuredOrigin?: string): void {
  const origin = request.headers.get('origin');
  if (!origin) return;
  let expected: string;
  try { expected = configuredOrigin ?? new URL(request.url).origin; }
  catch { throw new VkOAuthError('CONFIG'); }
  if (origin !== expected) throw new UnauthorizedError();
}
