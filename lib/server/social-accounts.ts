import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/index.ts';
import { createMaxConnector } from './connectors/max.ts';
import { createTelegramConnector } from './connectors/telegram.ts';
import { socialAccounts, socialBindings, users } from '../../db/schema.ts';
import { assertDestinationAvailable, lockProviderDestinations, SocialConnectionError } from './social-connections/state.ts';
import { type SocialAccountDto } from '../contracts/planner.ts';
import {readSocialAccountDtos, socialAccountDto as toDto} from './social-connections/metadata.ts';
import { disconnectVkAccount } from './vk/oauth.ts';

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
    {
      id: randomUUID(), userId, provider: 'VK', displayName: 'VK',
      enabled: false, connectionStatus: 'DISCONNECTED',
    },
  ]).onConflictDoNothing({ target: [socialAccounts.userId, socialAccounts.provider] });
}

export async function listSocialAccounts(userId: string): Promise<SocialAccountDto[]> {
  return readSocialAccountDtos(getDb(),userId);
}

export async function setSocialAccountEnabled(
  userId: string,
  accountId: string,
  enabled: boolean,
): Promise<SocialAccountDto> {
  const db = getDb();
  const [account] = await db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.userId, userId))).limit(1);
  if (!account) throw new Error('Social account not found');
  if (account.provider === 'VK') {
    if (enabled) {
      // OAuth completion is the sole path that enables VK and commits its credentials.
      if (!account.enabled || account.connectionStatus !== 'CONNECTED') throw new Error('Reconnect VK through VK ID.');
      return toDto(account);
    }
    await disconnectVkAccount(userId, accountId);
    const [disconnected] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, accountId));
    return toDto(disconnected);
  }
  const [row] = await db.update(socialAccounts)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.userId, userId)))
    .returning();
  if (!row) throw new Error('Social account not found');
  return toDto(row);
}


export async function connectSocialAccount(userId: string, accountId: string, destinationId: string): Promise<SocialAccountDto | {ok:false;message:string}> {
  const db = getDb();
  const denied = {ok:false as const,message:'Подтвердите подключение через Mini App в своей сессии.'};
  const snapshot = await db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id,userId)).for('update');
    const [account] = await tx.select().from(socialAccounts).where(and(eq(socialAccounts.id,accountId),eq(socialAccounts.userId,userId))).for('update');
    if (!user || !account) throw new Error('Social account not found');
    const [binding] = await tx.select().from(socialBindings).where(eq(socialBindings.accountId,accountId));
    if (binding || user.authInitialized && (user.role==='USER' || user.accessState!=='ACTIVE')) return null;
    return {user,account};
  });
  if (!snapshot) return denied;
  const {account}=snapshot;
  if (account.provider === 'VK') return { ok: false, message: 'Подключи сообщество через VK ID.' };
  const connector = account.provider === 'MAX' ? createMaxConnector({token:process.env.MAX_BOT_TOKEN ?? ''}) : createTelegramConnector({token:process.env.TELEGRAM_BOT_TOKEN ?? ''});
  const result = await connector.validate(destinationId);
  if (!result.ok) return {ok:false,message:result.message};
  try {
    return await db.transaction(async tx => {
      const [user]=await tx.select().from(users).where(eq(users.id,userId)).for('update');
      const [current]=await tx.select().from(socialAccounts).where(and(eq(socialAccounts.id,accountId),eq(socialAccounts.userId,userId))).for('update');
      if(!user || !current || user.sessionVersion!==snapshot.user.sessionVersion || user.authInitialized!==snapshot.user.authInitialized || user.accessState!==snapshot.user.accessState || user.role!==snapshot.user.role || current.connectionGeneration!==account.connectionGeneration || current.bindingRevision!==account.bindingRevision) return denied;
      await lockProviderDestinations(tx,account.provider as 'TELEGRAM'|'MAX');
      await assertDestinationAvailable(tx,accountId,account.provider as 'TELEGRAM'|'MAX',result.destinationId);
      const [binding]=await tx.select().from(socialBindings).where(eq(socialBindings.accountId,accountId));
      if(binding) return denied;
      const [updated] = await tx.update(socialAccounts).set({providerAccountId:result.destinationId,displayName:result.displayName,
        connectionStatus:'CONNECTED',enabled:true,connectionGeneration:current.connectionGeneration+1,updatedAt:new Date()}).where(eq(socialAccounts.id,accountId)).returning();
      return toDto(updated);
    });
  } catch(error) {if(error instanceof SocialConnectionError) return {ok:false,message:error.message};throw error;}
}

// Compatibility for existing callers; provider dispatch always comes from the owner-scoped account.
export const connectTelegramAccount = connectSocialAccount;
