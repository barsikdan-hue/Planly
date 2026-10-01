import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb } from '../../../db/index';
import { sessions, users } from '../../../db/schema';
import { getServerEnv, getSessionEnv } from '../env';

export const SESSION_COOKIE_NAME = 'planly_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Owner = {
  id: string;
  email: string;
  displayName: string;
};

function sessionTokenHash(token: string): string {
  return createHmac('sha256', getSessionEnv().SESSION_SECRET).update(token).digest('hex');
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: getServerEnv().NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export async function createOwnerSession(userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString('base64url');
  await getDb().insert(sessions).values({
    id: randomUUID(),
    userId,
    tokenHash: sessionTokenHash(rawToken),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return rawToken;
}

export async function getOwnerBySessionToken(rawToken: string): Promise<Owner | null> {
  if (!rawToken) return null;
  const rows = await getDb()
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, sessionTokenHash(rawToken)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSessionByToken(rawToken: string): Promise<void> {
  if (!rawToken) return;
  await getDb().delete(sessions).where(eq(sessions.tokenHash, sessionTokenHash(rawToken)));
}

export async function setOwnerSessionCookie(rawToken: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, rawToken, sessionCookieOptions());
}

export async function getOwnerFromSession(): Promise<Owner | null> {
  const rawToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return rawToken ? getOwnerBySessionToken(rawToken) : null;
}

export async function destroyOwnerSession(): Promise<void> {
  const store = await cookies();
  const rawToken = store.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) await deleteSessionByToken(rawToken);
  store.delete(SESSION_COOKIE_NAME);
}
