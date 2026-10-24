import { eq } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { users } from '../../../db/schema.ts';
import { hasManualAccess } from '../../manual-access.ts';
import { ForbiddenError } from './access.ts';

export class ManualAccessExpiredError extends ForbiddenError {
  constructor() { super(); this.name = 'ManualAccessExpiredError'; }
}
type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
export async function requireManualWrite(tx: Tx, userId: string) {
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
  if (!user || !hasManualAccess(user)) throw new ManualAccessExpiredError();
  return user;
}
export async function hasCurrentManualAccess(userId: string): Promise<boolean> {
  const [user] = await getDb().select().from(users).where(eq(users.id, userId));
  return !!user && hasManualAccess(user);
}
