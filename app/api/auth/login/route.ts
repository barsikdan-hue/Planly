import { NextResponse } from 'next/server.js';
import { z } from 'zod';
import { ForbiddenError, requireSameOriginMutation, SessionAccessError } from '../../../../lib/server/auth/access.ts';
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
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(1024),
}).strict();

function loginFingerprint(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown';
  // Changing a caller-controlled User-Agent must not grant another failure allowance.
  return ip;
}

function authJson(data:unknown,init:ResponseInit={}) {
  const headers=new Headers(init.headers);headers.set('cache-control','private, no-store');
  return NextResponse.json(data,{...init,headers});
}

export async function POST(request: Request) {
  try { requireSameOriginMutation(request); }
  catch(error) { if(error instanceof ForbiddenError)return authJson({error:'Forbidden'},{status:403,headers:{'cache-control':'private, no-store'}});throw error; }
  const fingerprint = loginFingerprint(request);
  const rate = await checkLoginRateLimit(fingerprint);
  if (!rate.allowed) {
    return authJson(
      { error: 'Слишком много попыток входа. Попробуй позже.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return authJson({ error: 'Некорректный запрос.' }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return authJson({ error: 'Проверь email и пароль.' }, { status: 422 });

  const owner = await authenticateOwner(parsed.data.email, parsed.data.password);
  if (!owner) {
    await recordLoginFailure(fingerprint);
    return authJson({ error: 'Неверный email или пароль.' }, { status: 401 });
  }

  await clearLoginFailures(fingerprint);
  let rawToken: string;
  try { rawToken=await createOwnerSession(owner.id,owner.sessionVersion); }
  catch(error) { if(error instanceof SessionAccessError)return authJson({error:'Неверный email или пароль.'},{status:401,headers:{'cache-control':'private, no-store'}});throw error; }
  const response = authJson({ ok: true },{headers:{'cache-control':'private, no-store'}});
  response.cookies.set(SESSION_COOKIE_NAME, rawToken, sessionCookieOptions());
  return response;
}
