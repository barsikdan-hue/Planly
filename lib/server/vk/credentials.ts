import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from '../../../db/index.ts';
import { getVkConfig, VkOAuthError } from './config.ts';
import { openVkPayload, sealVkPayload, type VkEnvelope } from './crypto.ts';
import { requestVkGrant } from './oauth.ts';

export type VkCredentialPayload = { accessToken: string; refreshToken: string; deviceId: string; scopes: string[] };
type CredentialRow = { ciphertext: string; iv: string; tag: string; key_version: string; expires_at: Date; refresh_state: 'READY' | 'UNCERTAIN' };
export function rowEnvelope(row: { ciphertext: string; iv: string; tag: string; key_version: string }): VkEnvelope {
  return { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, keyVersion: row.key_version };
}

// A session lock spans both commits and the external rotation. Never pool a locked session.
export async function withVkAccountLock<T>(accountId: string, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient | undefined; let locked = false; let discard = false;
  const key = `planly:vk:account:${accountId}`;
  try {
    client = await getPool().connect();
    await client.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [key]); locked = true;
    return await operation(client);
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch { discard = true; } }
    throw error instanceof VkOAuthError ? error : new VkOAuthError('AUTH');
  } finally {
    if (client) {
      if (locked && !discard) { try { await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [key]); } catch { discard = true; } }
      client.release(discard);
    }
  }
}

export async function readVkAccount(client: PoolClient, accountId: string, ownerId?: string, requireConnected = false) {
  const result = await client.query<{ id: string; user_id: string; provider: string; enabled: boolean; connection_status: string }>('SELECT id,user_id,provider,enabled,connection_status FROM social_accounts WHERE id=$1 FOR UPDATE', [accountId]);
  const account = result.rows[0];
  if (!account || account.provider !== 'VK' || (ownerId !== undefined && account.user_id !== ownerId)) throw new VkOAuthError(ownerId === undefined ? 'AUTH' : 'NOT_FOUND');
  if (requireConnected && (!account.enabled || account.connection_status !== 'CONNECTED')) throw new VkOAuthError('AUTH');
  return account;
}

function credentialPayload(raw: unknown): VkCredentialPayload {
  if (!raw || typeof raw !== 'object') throw new VkOAuthError('AUTH');
  const value = raw as Partial<VkCredentialPayload>;
  if (!value.accessToken || typeof value.accessToken !== 'string' || !value.refreshToken || typeof value.refreshToken !== 'string' || !value.deviceId || typeof value.deviceId !== 'string' || !Array.isArray(value.scopes) || !value.scopes.includes('wall') || !value.scopes.includes('photos') || !value.scopes.every(scope => typeof scope === 'string')) throw new VkOAuthError('AUTH');
  return value as VkCredentialPayload;
}

export async function getVkAccessToken(socialAccountId: string): Promise<string> {
  if (!socialAccountId) throw new VkOAuthError('AUTH');
  return withVkAccountLock(socialAccountId, async client => {
    await client.query('BEGIN');
    await readVkAccount(client, socialAccountId, undefined, true);
    const result = await client.query<CredentialRow>('SELECT ciphertext,iv,tag,key_version,expires_at,refresh_state FROM vk_credentials WHERE account_id=$1 FOR UPDATE', [socialAccountId]);
    const row = result.rows[0];
    if (!row || row.refresh_state !== 'READY') throw new VkOAuthError('AUTH');
    const config = getVkConfig(); const binding = { accountId: socialAccountId, provider: 'VK', purpose: 'CREDENTIALS' };
    const payload = credentialPayload(openVkPayload(rowEnvelope(row), binding, config));
    if (new Date(row.expires_at).getTime() > Date.now() + 30_000) { await client.query('COMMIT'); return payload.accessToken; }

    // This commit is the safety boundary: no outcome after dispatch may reuse the old refresh.
    await client.query("UPDATE vk_credentials SET refresh_state='UNCERTAIN',updated_at=now() WHERE account_id=$1", [socialAccountId]);
    await client.query('COMMIT');
    const grant = await requestVkGrant({ grant_type: 'refresh_token', refresh_token: payload.refreshToken, device_id: payload.deviceId, state: randomBytes(32).toString('base64url') }, config, payload.scopes);
    const envelope = sealVkPayload({ accessToken: grant.accessToken, refreshToken: grant.refreshToken, deviceId: payload.deviceId, scopes: grant.scopes }, binding, config);
    await client.query('BEGIN');
    await readVkAccount(client, socialAccountId, undefined, true);
    const updated = await client.query("UPDATE vk_credentials SET ciphertext=$2,iv=$3,tag=$4,key_version=$5,expires_at=$6,refresh_state='READY',updated_at=now() WHERE account_id=$1 AND refresh_state='UNCERTAIN'", [socialAccountId, envelope.ciphertext, envelope.iv, envelope.tag, envelope.keyVersion, new Date(Date.now() + grant.expiresIn * 1000)]);
    if (updated.rowCount !== 1) throw new VkOAuthError('AUTH');
    await client.query('COMMIT');
    return grant.accessToken;
  });
}
