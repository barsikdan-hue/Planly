import { ZodError } from 'zod';
import { consumePasswordReset, PasswordResetError, passwordResetInputSchema } from './password-reset.ts';
import { consumeInvitationRateLimit, consumeInvitationTokenRateLimit, InvitationError } from './invitations.ts';
import { ForbiddenError, rejectIdentityPayload } from './access.ts';

type Budget = { allowed: boolean; retryAfterSeconds: number };
type Dependencies = {
  ipBudget: (request: Request) => Promise<Budget>;
  tokenBudget: (token: string) => Promise<Budget>;
  consume: (input: unknown) => Promise<{ ok: boolean }>;
};
export function createPasswordResetHandler(dependencies: Dependencies = {
  ipBudget: consumeInvitationRateLimit, tokenBudget: consumeInvitationTokenRateLimit, consume: consumePasswordReset,
}) {
  return async function POST(request: Request) {
    const headers = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' };
    const limited = (budget: Budget) => Response.json({ error: 'Слишком много попыток. Попробуйте позже.' }, {
      status: 429, headers: { ...headers, 'retry-after': String(budget.retryAfterSeconds) },
    });
    try {
      const ip = await dependencies.ipBudget(request);
      if (!ip.allowed) return limited(ip);
      const raw: unknown = await request.json();
      rejectIdentityPayload(raw);
      const input = passwordResetInputSchema.parse(raw);
      const token = await dependencies.tokenBudget(input.token);
      if (!token.allowed) return limited(token);
      return Response.json(await dependencies.consume(input), { headers });
    } catch (error) {
      const status = error instanceof PasswordResetError ? 410 : error instanceof InvitationError ? error.status : error instanceof ForbiddenError ? 403 : error instanceof ZodError || error instanceof SyntaxError ? 422 : 500;
      return Response.json({ error: status === 410 ? 'Ссылка сброса недействительна или истекла.' : status === 422 ? 'Пароль должен содержать от 12 до 128 символов.' : 'Не удалось изменить пароль.' }, { status, headers });
    }
  };
}
