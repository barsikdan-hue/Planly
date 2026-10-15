import { and, eq, gt } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { sessions, users } from '../../../db/schema.ts';
import { ForbiddenError } from './access.ts';
import { requireApiOwner, requestCookie, UnauthorizedError } from './owner.ts';
import { SESSION_COOKIE_NAME, sessionTokenHash } from './session.ts';

export type AuthTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

// Recheck authorization after obtaining the lifecycle lock: the original
// session lookup may precede a concurrent role change or session revocation.
export async function withAdmin<T>(request: Request, work: (tx: AuthTransaction, userId: string) => Promise<T>): Promise<T> {
  const identity = await requireApiOwner(request);
  return getDb().transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, identity.id)).for('update');
    if (!user?.authInitialized || user.accessState !== 'ACTIVE') throw new UnauthorizedError();
    const [session] = await tx.select({ id: sessions.id }).from(sessions).where(and(
      eq(sessions.userId, user.id),
      eq(sessions.tokenHash, sessionTokenHash(requestCookie(request, SESSION_COOKIE_NAME) ?? '')),
      eq(sessions.sessionVersion, user.sessionVersion),
      gt(sessions.expiresAt, new Date()),
    )).limit(1);
    if (!session) throw new UnauthorizedError();
    if (user.role !== 'ADMIN') throw new ForbiddenError();
    return work(tx, user.id);
  });
}
