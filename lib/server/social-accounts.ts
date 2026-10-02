import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/index.ts';
import { createTelegramConnector } from './connectors/telegram.ts';
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


export async function connectTelegramAccount(userId: string, accountId: string, destinationId: string): Promise<SocialAccountDto | {ok:false;message:string}> {
  const db = getDb();
  const [account] = await db.select().from(socialAccounts).where(and(eq(socialAccounts.id,accountId),eq(socialAccounts.userId,userId))).limit(1);
  if (!account) throw new Error('Social account not found');
  if (account.provider !== 'TELEGRAM') return {ok:false,message:'MAX connection is not implemented yet.'};
  const result = await createTelegramConnector({token:process.env.TELEGRAM_BOT_TOKEN ?? ''}).validate(destinationId);
  if (!result.ok) return {ok:false,message:result.message};
  const [updated] = await db.update(socialAccounts).set({providerAccountId:result.destinationId,displayName:result.displayName,
    connectionStatus:'CONNECTED',enabled:true,updatedAt:new Date()}).where(and(eq(socialAccounts.id,accountId),eq(socialAccounts.userId,userId))).returning();
  if (!updated) throw new Error('Social account not found');
  return toDto(updated);
}
