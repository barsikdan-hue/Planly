import { and, desc, eq, sql } from 'drizzle-orm';
import { z, ZodError } from 'zod';
import { users } from '../../../db/schema.ts';
import { getOwnerEmail } from '../env.ts';
import { ForbiddenError, rejectIdentityPayload, setUserAccessStateInTransaction } from './access.ts';
import { withAdmin } from './admin.ts';
import { UnauthorizedError } from './owner.ts';

const actionSchema = z.object({ action: z.enum(['block', 'restore']) }).strict();
const identityColumns = { id: users.id, email: users.email, displayName: users.displayName, accessState: users.accessState, createdAt: users.createdAt };
function manageableUser(id?: string) {
  return and(id === undefined ? undefined : eq(users.id, id), eq(users.role, 'USER'), eq(users.authInitialized, true), sql`lower(trim(${users.email})) <> ${getOwnerEmail()}`);
}
class UserNotFoundError extends Error {}

export async function listManagedUsers(request: Request) {
  return withAdmin(request, async tx => ({ users: await tx.select(identityColumns).from(users).where(manageableUser()).orderBy(desc(users.createdAt), users.id) }));
}

export async function changeManagedUserAccess(request: Request, id: string) {
  return withAdmin(request, async (tx, actorId) => {
    const body: unknown = await request.json();
    rejectIdentityPayload(body);
    const { action } = actionSchema.parse(body);
    if (id === actorId) throw new ForbiddenError();
    // Only USER rows are eligible for the second lock. Two ADMINs targeting
    // one another never acquire each other's actor locks in reverse order.
    const [target] = await tx.select(identityColumns).from(users).where(manageableUser(id)).for('update');
    if (!target) {
      const [existing] = await tx.select({ role: users.role, email: users.email }).from(users).where(eq(users.id, id)).limit(1);
      if (existing && (existing.role === 'ADMIN' || existing.email.trim().toLowerCase() === getOwnerEmail())) throw new ForbiddenError();
      throw new UserNotFoundError();
    }
    await setUserAccessStateInTransaction(tx, target.id, action === 'block' ? 'BLOCKED' : 'ACTIVE');
    const [user] = await tx.select(identityColumns).from(users).where(eq(users.id, target.id));
    return { user };
  });
}

export function managedUserJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' } });
}
export function managedUserError(error: unknown) {
  if (error instanceof UnauthorizedError) return managedUserJson({ error: 'Unauthorized' }, 401);
  if (error instanceof ForbiddenError) return managedUserJson({ error: 'Forbidden' }, 403);
  if (error instanceof UserNotFoundError) return managedUserJson({ error: 'Пользователь не найден.' }, 404);
  if (error instanceof ZodError) return managedUserJson({ error: 'Проверьте действие.' }, 422);
  if (error instanceof SyntaxError) return managedUserJson({ error: 'Некорректный запрос.' }, 400);
  // Database errors may contain authentication data; never log or echo them.
  return managedUserJson({ error: 'Не удалось изменить доступ пользователя.' }, 500);
}
