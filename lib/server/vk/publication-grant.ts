import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { socialAccounts, users, vkCredentials } from '../../../db/schema.ts';
import type { ConnectionTransaction } from '../social-connections/state.ts';
import { getVkConfig, type VkConfig } from './config.ts';
import { openVkPayload } from './crypto.ts';

export type VkPublicationGrant = { userId: string; sessionVersion: number; generation: number; revision: number; destinationId: string; configRevision: string };

// A configuration change invalidates the grant, without reflecting any secret.
export function vkPublicationConfigRevision(config: VkConfig = getVkConfig()): string {
  return createHash('sha256').update(JSON.stringify(['VK', config.clientId, config.serviceToken, config.redirectUri, config.encryptionKey, config.keyVersion])).digest('hex');
}

// The caller holds user -> account. The encrypted grant is the VK proof store;
// social_bindings remains exclusively the Telegram/MAX native-proof protocol.
export async function readVkPublicationGrant(tx: ConnectionTransaction, user: typeof users.$inferSelect, account: typeof socialAccounts.$inferSelect): Promise<{ token: string; grant: VkPublicationGrant } | null> {
  if (account.provider !== 'VK' || account.userId !== user.id) return null;
  const [row] = await tx.select().from(vkCredentials).where(eq(vkCredentials.accountId, account.id)).for('update');
  if (!row || row.refreshState !== 'READY') return null;
  try {
    const config = getVkConfig();
    const payload = openVkPayload({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, keyVersion: row.keyVersion }, { accountId: account.id, provider: 'VK', purpose: 'CREDENTIALS' }, config) as { accessToken?: unknown; scopes?: unknown; publicationGrant?: Partial<VkPublicationGrant> };
    const grant = payload?.publicationGrant;
    if (!grant || typeof payload.accessToken !== 'string' || !payload.accessToken || /\s/.test(payload.accessToken) || !Array.isArray(payload.scopes) || !payload.scopes.includes('wall') || !payload.scopes.includes('photos') ||
      grant.userId !== user.id || grant.sessionVersion !== user.sessionVersion || grant.generation !== account.connectionGeneration || grant.revision !== account.bindingRevision ||
      grant.destinationId !== account.providerAccountId || typeof grant.destinationId !== 'string' || !/^-[1-9]\d{0,15}$/.test(grant.destinationId) || !Number.isSafeInteger(Number(grant.destinationId)) ||
      !Number.isSafeInteger(grant.sessionVersion) || !Number.isSafeInteger(grant.generation) || !Number.isSafeInteger(grant.revision) || grant.revision! < 1 || grant.generation! < 0 || grant.sessionVersion! < 0 ||
      grant.configRevision !== vkPublicationConfigRevision(config)) return null;
    return { token: payload.accessToken, grant: grant as VkPublicationGrant };
  } catch { return null; }
}
