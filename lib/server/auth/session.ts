import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { sessions, users } from '../../../db/schema.ts';
import { getServerEnv, getSessionEnv } from '../env.ts';
import { initializeLegacyOwner, SessionAccessError } from './access.ts';

export const SESSION_COOKIE_NAME = 'planly_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Owner = {
  id: string;
  email: string;
  displayName: string;
  sessionVersion?: number;
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

export async function createOwnerSession(userId: string, expectedVersion?: number): Promise<string> {
  await initializeLegacyOwner();
  return getDb().transaction(async tx => {
    const [user]=await tx.select().from(users).where(eq(users.id,userId)).for('update');
    if(!user || !user.authInitialized || user.accessState!=='ACTIVE' || expectedVersion!==undefined && expectedVersion!==user.sessionVersion) throw new SessionAccessError();
    const rawToken=randomBytes(32).toString('base64url');
    await tx.insert(sessions).values({id:randomUUID(),userId,tokenHash:sessionTokenHash(rawToken),sessionVersion:user.sessionVersion,expiresAt:new Date(Date.now()+SESSION_TTL_MS)});
    return rawToken;
  });
}

export async function getOwnerBySessionToken(rawToken: string): Promise<Owner | null> {
  if (!rawToken) return null;
  await initializeLegacyOwner();
  const rows = await getDb()
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(
      eq(sessions.tokenHash, sessionTokenHash(rawToken)),
      gt(sessions.expiresAt, new Date()),
      eq(users.authInitialized, true),
      eq(users.accessState, 'ACTIVE'),
      eq(sessions.sessionVersion, users.sessionVersion),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSessionByToken(rawToken: string): Promise<void> {
  if (!rawToken) return;
  await getDb().delete(sessions).where(eq(sessions.tokenHash, sessionTokenHash(rawToken)));
}
