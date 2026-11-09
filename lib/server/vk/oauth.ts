import { createHash, randomBytes } from 'node:crypto';
import { getPool } from '../../../db/index.ts';
import { getVkConfig, VkOAuthError, type VkConfig, type VkOAuthDiagnostic } from './config.ts';
import { vkCommunityOAuthFailure, vkInvalidGrantReason, vkProviderFailureReason, vkTokenExchangeMetadata } from './diagnostics.ts';
import { openVkPayload, sealVkPayload } from './crypto.ts';
import { readVkAccount, rowEnvelope, withVkAccountLock } from './credentials.ts';
import type { PoolClient } from 'pg';
import { hasManualAccess } from '../../manual-access.ts';
import { vkPublicationConfigRevision } from './publication-grant.ts';
export { VkOAuthError } from './config.ts';

export type VkGrant = { accessToken: string; refreshToken: string; expiresIn: number; scopes: string[] };
export function parseVkGrant(raw: unknown): VkGrant {
  if (!raw || typeof raw !== 'object') throw new VkOAuthError('AUTH', { stage: 'GRANT_VALIDATION', reason: 'INVALID_RESPONSE' });
  const value = raw as Record<string, unknown>;
  if (value.error || typeof value.access_token !== 'string' || !value.access_token || value.access_token.length > 16000 || /[\s\x00-\x1f\x7f]/.test(value.access_token) || typeof value.refresh_token !== 'string' || !value.refresh_token || value.refresh_token.length > 16000 || /[\s\x00-\x1f\x7f]/.test(value.refresh_token) || typeof value.expires_in !== 'number' || !Number.isSafeInteger(value.expires_in) || value.expires_in <= 0 || value.expires_in > 31_536_000 || typeof value.scope !== 'string') throw new VkOAuthError('AUTH', { stage: 'GRANT_VALIDATION', reason: 'INVALID_RESPONSE' });
  const scopes = [...new Set(value.scope.split(/[\s,]+/).filter(Boolean))];
  if (!scopes.includes('wall') || !scopes.includes('photos')) throw new VkOAuthError('AUTH', { stage: 'GRANT_VALIDATION', reason: 'MISSING_PUBLISHING_SCOPES' });
  return { accessToken: value.access_token, refreshToken: value.refresh_token, expiresIn: value.expires_in, scopes };
}

export async function requestVkGrant(fields: Record<string, string>, config: VkConfig): Promise<VkGrant> {
  try {
    const response = await fetch('https://id.vk.ru/oauth2/auth', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...fields, client_id: config.clientId, service_token: config.serviceToken, redirect_uri: config.redirectUri }), redirect: 'error', signal: AbortSignal.timeout(15_000) });
    let raw: unknown;
    try { raw = await response.json(); }
    catch { throw new VkOAuthError('AUTH', { stage: 'TOKEN_EXCHANGE', reason: response.ok ? 'INVALID_RESPONSE' : 'HTTP_REJECTED' }); }
    if (!raw || typeof raw !== 'object') throw new VkOAuthError('AUTH', { stage: 'TOKEN_EXCHANGE', reason: response.ok ? 'INVALID_RESPONSE' : 'HTTP_REJECTED' });
    const value = raw as Record<string, unknown>;
    if (value.error) throw new VkOAuthError('AUTH', { stage: 'TOKEN_EXCHANGE', reason: vkProviderFailureReason(value.error) }, value.error === 'invalid_grant' ? vkInvalidGrantReason(value.error_description) : undefined,
      value.error === 'invalid_grant' && fields.grant_type === 'authorization_code' ? vkTokenExchangeMetadata(response.status, value.error_description) : undefined);
    if (!response.ok) throw new VkOAuthError('AUTH', { stage: 'TOKEN_EXCHANGE', reason: 'HTTP_REJECTED' });
    if (typeof value.state !== 'string' || !fields.state || value.state !== fields.state) throw new VkOAuthError('AUTH', { stage: 'TOKEN_EXCHANGE', reason: 'STATE_MISMATCH' });
    // Request-scope inheritance does not prove the replacement token's returned
    // permissions. Both initial and refreshed grants need explicit fresh scope.
    return parseVkGrant(value);
  } catch (error) { throw error instanceof VkOAuthError ? error : new VkOAuthError('AUTH', { stage: 'TOKEN_EXCHANGE', reason: 'TRANSPORT_FAILED' }); }
}

function hashState(state: string) { return createHash('sha256').update(state).digest('hex'); }
function communityId(value: string): string {
  if (!/^[1-9]\d{0,14}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new VkOAuthError('VALIDATION');
  return value;
}

type VkActor = { id:string;email:string;auth_initialized:boolean;access_state:string;session_version:number;role:string;access_expires_at:Date|null };
async function readVkActor(client:PoolClient,userId:string,expectedSessionVersion?:number,allowExpired=false):Promise<VkActor> {
  const {rows}=await client.query<VkActor>('SELECT id,email,auth_initialized,access_state,session_version,role,access_expires_at FROM users WHERE id=$1 FOR UPDATE',[userId]);
  const actor=rows[0];
  if(!actor || !actor.auth_initialized || actor.access_state!=='ACTIVE' || !Number.isSafeInteger(actor.session_version) || expectedSessionVersion!==undefined && actor.session_version!==expectedSessionVersion || !allowExpired && !hasManualAccess({role:actor.role,accessExpiresAt:actor.access_expires_at}))throw new VkOAuthError('AUTH');
  return actor;
}

export async function startVkOAuth(userId: string, accountId: string, intendedCommunityId: string, expectedSessionVersion?:number): Promise<{ authorizationUrl: string }> {
  return withVkAccountLock(accountId, async client => {
    await client.query('BEGIN'); const actor=await readVkActor(client,userId,expectedSessionVersion); const account=await readVkAccount(client, accountId, userId);
    const community = communityId(intendedCommunityId); const config = getVkConfig();
    const state = randomBytes(32).toString('base64url'); const verifier = randomBytes(48).toString('base64url');
    const envelope = sealVkPayload({ verifier, stateHash: hashState(state), userId, communityId: community,sessionVersion:actor.session_version,generation:account.connection_generation,revision:account.binding_revision,configRevision:vkPublicationConfigRevision(config) }, { accountId, provider: 'VK', purpose: 'OAUTH_INTENT' }, config);
    await client.query('DELETE FROM vk_oauth_intents WHERE account_id=$1', [accountId]);
    await client.query('INSERT INTO vk_oauth_intents(state_hash,user_id,account_id,community_id,ciphertext,iv,tag,key_version,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [hashState(state), userId, accountId, community, envelope.ciphertext, envelope.iv, envelope.tag, envelope.keyVersion, new Date(Date.now() + 10 * 60_000)]);
    await client.query('COMMIT');
    const url = new URL('https://id.vk.ru/authorize');
    url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: config.redirectUri, state, scope: 'wall photos', prompt: 'consent', code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
    return { authorizationUrl: url.toString() };
  });
}

type IntentRow = { state_hash: string; user_id: string; account_id: string; community_id: string; ciphertext: string; iv: string; tag: string; key_version: string; expires_at: Date };
export async function completeVkOAuth(userId: string, input: { state: string; code: string; deviceId: string; sessionVersion?:number }, validateCommunity: (token: string, communityId: string) => Promise<{ destinationId: string; displayName: string }>): Promise<void> {
  if (!input.state || input.state.length > 256 || !input.code || input.code.length > 16000 || !input.deviceId || input.deviceId.length > 16000) throw new VkOAuthError('STATE', { stage: 'CALLBACK', reason: 'INVALID_RESPONSE' });
  let stage: VkOAuthDiagnostic['stage'] = 'OAUTH_INTENT';
  try {
    const stateHash = hashState(input.state);
    const found = await getPool().query<IntentRow>('SELECT account_id FROM vk_oauth_intents WHERE state_hash=$1 AND user_id=$2', [stateHash, userId]);
    if (!found.rows[0]) throw new VkOAuthError('STATE');
    const accountId = found.rows[0].account_id;
    await withVkAccountLock(accountId, async client => {
      await client.query('BEGIN'); const actor=await readVkActor(client,userId,input.sessionVersion); const account=await readVkAccount(client, accountId, userId);
      const result = await client.query<IntentRow>('SELECT * FROM vk_oauth_intents WHERE state_hash=$1 AND account_id=$2 AND user_id=$3 FOR UPDATE', [stateHash, accountId, userId]); const intent = result.rows[0];
      if (!intent || new Date(intent.expires_at).getTime() <= Date.now()) throw new VkOAuthError('STATE');
      const config = getVkConfig();
      const decrypted = openVkPayload(rowEnvelope(intent), { accountId, provider: 'VK', purpose: 'OAUTH_INTENT' }, config) as { verifier?: unknown; stateHash?: unknown; userId?: unknown; communityId?: unknown;sessionVersion?:unknown;generation?:unknown;revision?:unknown;configRevision?:unknown };
      if (!decrypted || typeof decrypted.verifier !== 'string' || decrypted.stateHash !== stateHash || decrypted.userId !== userId || decrypted.communityId !== intent.community_id || decrypted.sessionVersion!==actor.session_version || decrypted.generation!==account.connection_generation || decrypted.revision!==account.binding_revision || decrypted.configRevision!==vkPublicationConfigRevision(config)) throw new VkOAuthError('STATE');
      await client.query('DELETE FROM vk_oauth_intents WHERE state_hash=$1', [stateHash]); await client.query('COMMIT');
      stage = 'TOKEN_EXCHANGE';
      const grant = await requestVkGrant({ grant_type: 'authorization_code', code: input.code, device_id: input.deviceId, state: input.state, code_verifier: decrypted.verifier }, config);
      stage = 'COMMUNITY_VALIDATION';
      let destination: { destinationId: string; displayName: string };
      try { destination = await validateCommunity(grant.accessToken, intent.community_id); } catch (error) { throw vkCommunityOAuthFailure(error); }
      if (destination.destinationId !== `-${intent.community_id}` || !destination.displayName || destination.displayName.length > 512) throw new VkOAuthError('VALIDATION');
      stage = 'CREDENTIAL_PERSISTENCE';
      await client.query('BEGIN'); const currentActor=await readVkActor(client,userId,decrypted.sessionVersion as number); const currentAccount=await readVkAccount(client, accountId, userId);
      if(currentAccount.connection_generation!==decrypted.generation || currentAccount.binding_revision!==decrypted.revision || vkPublicationConfigRevision()!==decrypted.configRevision)throw new VkOAuthError('AUTH');
      const publicationGrant={userId,sessionVersion:currentActor.session_version,generation:currentAccount.connection_generation+1,revision:currentAccount.binding_revision+1,destinationId:destination.destinationId,configRevision:decrypted.configRevision};
      const envelope = sealVkPayload({ accessToken: grant.accessToken, refreshToken: grant.refreshToken, deviceId: input.deviceId, scopes: grant.scopes,publicationGrant }, { accountId, provider: 'VK', purpose: 'CREDENTIALS' }, config);
      await client.query("INSERT INTO vk_credentials(account_id,ciphertext,iv,tag,key_version,expires_at,refresh_state) VALUES ($1,$2,$3,$4,$5,$6,'READY') ON CONFLICT(account_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,iv=EXCLUDED.iv,tag=EXCLUDED.tag,key_version=EXCLUDED.key_version,expires_at=EXCLUDED.expires_at,refresh_state='READY',updated_at=now()", [accountId, envelope.ciphertext, envelope.iv, envelope.tag, envelope.keyVersion, new Date(Date.now() + grant.expiresIn * 1000)]);
      await client.query("UPDATE social_accounts SET provider_account_id=$2,display_name=$3,connection_status='CONNECTED',enabled=true,connection_generation=connection_generation+1,binding_revision=binding_revision+1,updated_at=now() WHERE id=$1 AND user_id=$4", [accountId, destination.destinationId, destination.displayName, userId]);
      await client.query('COMMIT');
    });
  } catch (error) {
    if (error instanceof VkOAuthError) {
      if (!error.diagnostic) Object.assign(error, { diagnostic: { stage, reason: 'FAILED' } });
      throw error;
    }
    throw new VkOAuthError('AUTH', { stage, reason: 'FAILED' });
  }
}

export async function disconnectVkAccount(userId: string, accountId: string,expectedSessionVersion?:number): Promise<void> {
  await withVkAccountLock(accountId, async client => {
    await client.query('BEGIN'); await readVkActor(client,userId,expectedSessionVersion,true); await readVkAccount(client, accountId, userId);
    await client.query('DELETE FROM vk_credentials WHERE account_id=$1', [accountId]);
    await client.query('DELETE FROM vk_oauth_intents WHERE account_id=$1', [accountId]);
    await client.query("UPDATE social_accounts SET enabled=false,connection_status='DISCONNECTED',provider_account_id=NULL,connection_generation=connection_generation+1,binding_revision=binding_revision+1,updated_at=now() WHERE id=$1 AND user_id=$2", [accountId, userId]);
    await client.query('COMMIT');
  });
}
