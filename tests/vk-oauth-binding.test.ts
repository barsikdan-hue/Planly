import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { startVkOAuth, completeVkOAuth, disconnectVkAccount } from '../lib/server/vk/oauth.ts';
import { openVkPayload } from '../lib/server/vk/crypto.ts';
import { getVkConfig } from '../lib/server/vk/config.ts';
import { setSocialAccountEnabled } from '../lib/server/social-accounts.ts';

const globals = globalThis as typeof globalThis & { __planlyPool?: unknown;__planlyDb?:unknown };
const originalPool = globals.__planlyPool,originalDb=globals.__planlyDb, originalFetch = globalThis.fetch, originalEnv = { ...process.env };
afterEach(() => { globals.__planlyPool = originalPool;globals.__planlyDb=originalDb; globalThis.fetch = originalFetch; process.env = { ...originalEnv }; });

function fixture() {
  Object.assign(process.env, { OWNER_EMAIL: 'owner@example.test', VK_CLIENT_ID: '123456', VK_SERVICE_TOKEN: randomBytes(24).toString('hex'), VK_REDIRECT_URI: 'https://lentaro.example.test/api/social-accounts/vk/callback', VK_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'), VK_CREDENTIAL_KEY_VERSION: '1' });
  const actor = { id: 'agent-a', email: 'agent-a@example.test', auth_initialized: true, access_state: 'ACTIVE', session_version: 7, role: 'USER', access_expires_at: null as Date | null };
  const account = { id: 'vk-a', user_id: actor.id, provider: 'VK', enabled: false, connection_status: 'DISCONNECTED', provider_account_id: null as string | null, connection_generation: 2, binding_revision: 3 };
  let intent: Record<string, unknown> | undefined, stored: Record<string, unknown> | undefined;
  let exchanges = 0;
  const client = { release() {}, async query(sql: string, values: unknown[] = []) {
    if (sql.startsWith('SELECT id,email')) return { rows: values[0] === actor.id ? [actor] : [] };
    if (sql.startsWith('SELECT id,user_id')) return { rows: values[0] === account.id ? [account] : [] };
    if (sql.startsWith('SELECT account_id FROM vk_oauth_intents')) return { rows: intent && values[1] === actor.id ? [{ account_id: account.id }] : [] };
    if (sql.startsWith('SELECT * FROM vk_oauth_intents')) return { rows: intent ? [intent] : [] };
    if (sql.startsWith('INSERT INTO vk_oauth_intents')) intent = { state_hash: values[0], user_id: values[1], account_id: values[2], community_id: values[3], ciphertext: values[4], iv: values[5], tag: values[6], key_version: values[7], expires_at: values[8] };
    if (sql.startsWith('DELETE FROM vk_oauth_intents')) intent = undefined;
    if (sql.startsWith('INSERT INTO vk_credentials')) stored = { ciphertext: values[1], iv: values[2], tag: values[3], keyVersion: values[4] };
    if (sql.startsWith('DELETE FROM vk_credentials')) stored = undefined;
    if (sql.startsWith('UPDATE social_accounts')) {
      if (sql.includes("connection_status='CONNECTED'")) Object.assign(account, { provider_account_id: values[1], enabled: true, connection_status: 'CONNECTED' });
      if (sql.includes("connection_status='DISCONNECTED'")) Object.assign(account, { provider_account_id: null, enabled: false, connection_status: 'DISCONNECTED' });
      if (sql.includes('connection_generation=connection_generation+1')) account.connection_generation++;
      if (sql.includes('binding_revision=binding_revision+1')) account.binding_revision++;
    }
    return { rows: [], rowCount: 1 };
  } };
  globals.__planlyPool = { connect: async () => client, query: client.query };
  globals.__planlyDb={select(){
    const rows=()=>[{id:account.id,userId:actor.id,provider:'VK',providerAccountId:account.provider_account_id,displayName:'Fixture community',enabled:account.enabled,connectionStatus:account.connection_status}];
    return {from(){return this;},where(){return this;},async limit(){return rows();},then(resolve:(value:unknown)=>unknown){return Promise.resolve(rows()).then(resolve);}};
  }};
  const token = randomBytes(24).toString('hex');
  globalThis.fetch = async (_url,init) => { exchanges++; return Response.json({ access_token: token, refresh_token: randomBytes(24).toString('hex'), expires_in: 3600, scope: 'wall photos',state:new URLSearchParams(String(init?.body)).get('state') }); };
  return { actor, account, token, get stored() { return stored; }, get exchanges() { return exchanges; }, async begin() {
    const start = await startVkOAuth(actor.id, account.id, '123');
    return { state: new URL(start.authorizationUrl).searchParams.get('state')!, code: 'synthetic-code', deviceId: 'synthetic-device' };
  } };
}

test('OAuth USER completion atomically stores encrypted epoch/generation/destination proof with next account revision', async () => {
  const f = fixture(), input = await f.begin();
  await completeVkOAuth(f.actor.id, input, async () => ({ destinationId: '-123', displayName: 'Fixture community' }));
  assert.equal(f.account.connection_generation, 3); assert.equal(f.account.binding_revision, 4);
  const payload = openVkPayload(f.stored as never, { accountId: f.account.id, provider: 'VK', purpose: 'CREDENTIALS' }, getVkConfig()) as { publicationGrant: Record<string, unknown> };
  assert.equal(payload.publicationGrant.userId, f.actor.id);
  assert.equal(payload.publicationGrant.sessionVersion, 7);
  assert.equal(payload.publicationGrant.generation, 3);
  assert.equal(payload.publicationGrant.revision, 4);
  assert.equal(payload.publicationGrant.destinationId, '-123');
  assert.match(String(payload.publicationGrant.configRevision), /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(f.stored).includes(f.token), false);
});

for (const fault of ['blocked', 'expired', 'epoch', 'account-owner', 'generation', 'revision'] as const) {
  test(`OAuth rejects ${fault} change during community validation without reconnecting or storing credentials`, async () => {
    const f = fixture(), input = await f.begin();
    await assert.rejects(() => completeVkOAuth(f.actor.id, input, async () => {
      if (fault === 'blocked') f.actor.access_state = 'BLOCKED';
      if (fault === 'expired') f.actor.access_expires_at = new Date(0);
      if (fault === 'epoch') f.actor.session_version++;
      if (fault === 'account-owner') f.account.user_id = 'agent-b';
      if (fault === 'generation') f.account.connection_generation++;
      if (fault === 'revision') f.account.binding_revision++;
      return { destinationId: '-123', displayName: 'Fixture community' };
    }));
    assert.equal(f.stored, undefined); assert.equal(f.account.enabled, false);
  });
}

test('VK disconnect revokes OAuth intent/credentials and advances both account lifecycle fences', async () => {
  const f = fixture(), input = await f.begin();
  await completeVkOAuth(f.actor.id, input, async () => ({ destinationId: '-123', displayName: 'Fixture community' }));
  const previousGeneration = f.account.connection_generation, previousRevision = f.account.binding_revision;
  await disconnectVkAccount(f.actor.id, f.account.id);
  assert.equal(f.stored, undefined); assert.equal(f.account.enabled, false);
  assert.equal(f.account.connection_generation, previousGeneration + 1);
  assert.equal(f.account.binding_revision, previousRevision + 1);
});

test('VK generic disable forwards the caller session epoch and preserves a newer grant on stale admission',async()=>{
  const f=fixture(),input=await f.begin();await completeVkOAuth(f.actor.id,input,async()=>({destinationId:'-123',displayName:'Fixture community'}));
  const previous=f.stored;f.actor.session_version++;
  await assert.rejects(()=>setSocialAccountEnabled(f.actor.id,f.account.id,false,7));
  assert.deepEqual(f.stored,previous);assert.equal(f.account.enabled,true);
});

test('generic VK PATCH carries its authenticated epoch through a later lifecycle lock',async()=>{
  const f=fixture(),input=await f.begin();await completeVkOAuth(f.actor.id,input,async()=>({destinationId:'-123',displayName:'Fixture community'}));
  const previous=f.stored,authenticatedEpoch=f.actor.session_version;f.actor.session_version++;
  Object.assign(process.env,{SESSION_SECRET:'fixture-session-key-of-at-least-32-characters',OWNER_PASSWORD_HASH:'fixture-password-hash'});
  // Session transport represents the authenticated snapshot; the raw actor read
  // represents revocation winning immediately before the later lifecycle lock.
  globals.__planlyDb={select(selection?:Record<string,unknown>){
    const rows=()=>selection?[{id:f.actor.id,email:process.env.OWNER_EMAIL,displayName:'Fixture owner',role:'ADMIN',accessExpiresAt:null,sessionVersion:authenticatedEpoch}]:[{id:f.account.id,userId:f.actor.id,provider:'VK',providerAccountId:f.account.provider_account_id,displayName:'Fixture community',enabled:f.account.enabled,connectionStatus:f.account.connection_status}];
    return {from(){return this;},innerJoin(){return this;},where(){return this;},async limit(){return rows();},then(resolve:(value:unknown)=>unknown){return Promise.resolve(rows()).then(resolve);}};
  },update:()=>({set:()=>({async where(){}})})};
  const {resetServerEnvForTests}=await import('../lib/server/env.ts');resetServerEnvForTests();
  const {PATCH}=await import('../app/api/social-accounts/[id]/route.ts');
  try {
    const response=await PATCH(new Request(`https://lentaro.example.test/api/social-accounts/${f.account.id}`,{method:'PATCH',headers:{cookie:'planly_session=fixture-synthetic-session',origin:'https://lentaro.example.test','content-type':'application/json'},body:JSON.stringify({enabled:false})}),{params:Promise.resolve({id:f.account.id})});
    assert.equal(response.ok,false);assert.deepEqual(f.stored,previous);assert.equal(f.account.enabled,true);
  }finally{resetServerEnvForTests();}
});
