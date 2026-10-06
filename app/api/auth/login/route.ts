import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateOwner } from '../../../../lib/server/auth/owner.ts';
import {
  createOwnerSession,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '../../../../lib/server/auth/session.ts';
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from '../../../../lib/server/auth/rate-limit.ts';

const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(1024),
});

function loginFingerprint(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown';
  // Changing a caller-controlled User-Agent must not grant another failure allowance.
  return ip;
}

export async function POST(request: Request) {
  const fingerprint = loginFingerprint(request);
  const rate = await checkLoginRateLimit(fingerprint);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Попробуй позже.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос.' }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Проверь email и пароль.' }, { status: 422 });

  const owner = await authenticateOwner(parsed.data.email, parsed.data.password);
  if (!owner) {
    await recordLoginFailure(fingerprint);
    return NextResponse.json({ error: 'Неверный email или пароль.' }, { status: 401 });
  }

  await clearLoginFailures(fingerprint);
  const rawToken = await createOwnerSession(owner.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, rawToken, sessionCookieOptions());
  return response;
}
