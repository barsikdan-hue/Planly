import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/index.ts';
import { socialAccounts } from '../../db/schema.ts';
import { fromDbProvider, type SocialAccountDto } from '../contracts/planner.ts';

function toDto(row: typeof socialAccounts.$inferSelect): SocialAccountDto {
  return {
    id: row.id,
    provider: fromDbProvider(row.provider),
    providerAccountId: row.providerAccountId,
    displayName: row.displayName,
    enabled: row.enabled,
    connectionStatus: row.connectionStatus,
  };
}

export async function ensureOwnerSocialAccounts(userId: string): Promise<void> {
  const db = getDb();
  await db.insert(socialAccounts).values([
    {
      id: randomUUID(),
      userId,
      provider: 'TELEGRAM',
      displayName: 'Telegram',
      enabled: false,
      connectionStatus: 'DISCONNECTED',
    },
    {
      id: randomUUID(),
      userId,
      provider: 'MAX',
      displayName: 'MAX',
      enabled: false,
      connectionStatus: 'DISCONNECTED',
    },
  ]).onConflictDoNothing({ target: [socialAccounts.userId, socialAccounts.provider] });
}

export async function listSocialAccounts(userId: string): Promise<SocialAccountDto[]> {
  const db = getDb();
  const rows = await db.select().from(socialAccounts)
    .where(eq(socialAccounts.userId, userId))
    .orderBy(asc(socialAccounts.provider));
  return rows.map(toDto);
}

export async function setSocialAccountEnabled(
  userId: string,
  accountId: string,
  enabled: boolean,
): Promise<SocialAccountDto> {
  const db = getDb();
  const [row] = await db.update(socialAccounts)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.userId, userId)))
    .returning();
  if (!row) throw new Error('Social account not found');
  return toDto(row);
}
