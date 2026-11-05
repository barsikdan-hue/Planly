import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { socialAccounts, socialBindings, users, vkCredentials } from '../db/schema.ts';
import { capturePublicationBinding, observePublicationAuthorization, beginVerifiedProviderHandoff } from '../lib/server/social-connections/publication-authorization.ts';
import { sealVkPayload } from '../lib/server/vk/crypto.ts';
import { getVkConfig } from '../lib/server/vk/config.ts';
import { createHash } from 'node:crypto';
import type { ConnectionTransaction } from '../lib/server/social-connections/state.ts';

const savedEnv = { ...process.env };
const globals = globalThis as typeof globalThis & { __planlyDb?: unknown; __planlyPool?: unknown };
const originalDb = globals.__planlyDb;
const originalPool = globals.__planlyPool;
const originalFetch = globalThis.fetch;
afterEach(() => { process.env = { ...savedEnv }; globals.__planlyDb = originalDb; globals.__planlyPool = originalPool; globalThis.fetch = originalFetch; });

function fixture() {
  Object.assign(process.env, { OWNER_EMAIL: 'owner@example.test', VK_CLIENT_ID: '123456', VK_SERVICE_TOKEN: randomBytes(24).toString('hex'), VK_REDIRECT_URI: 'https://lentaro.example.test/api/social-accounts/vk/callback', VK_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'), VK_CREDENTIAL_KEY_VERSION: '1' });
  const config = getVkConfig();
  const configRevision = createHash('sha256').update(JSON.stringify(['VK', config.clientId, config.serviceToken, config.redirectUri, config.encryptionKey, config.keyVersion])).digest('hex');
  const user = { id: 'agent-a', email: 'agent-a@example.test', role: 'USER', authInitialized: true, accessState: 'ACTIVE', sessionVersion: 7, accessExpiresAt: null };
  const account = { id: 'vk-a', userId: user.id, provider: 'VK', providerAccountId: '-123', enabled: true, connectionStatus: 'CONNECTED', connectionGeneration: 3, bindingRevision: 4 };
  const grant = { userId: user.id, sessionVersion: 7, generation: 3, revision: 4, destinationId: '-123', configRevision };
  const token = randomBytes(24).toString('hex');
  let credential: Record<string, unknown>;
  function reseal(override: Record<string, unknown> = {}) {
    const envelope = sealVkPayload({ accessToken: token, refreshToken: randomBytes(24).toString('hex'), deviceId: 'fixture-device', scopes: ['wall', 'photos'], publicationGrant: { ...grant, ...override } }, { accountId: account.id, provider: 'VK', purpose: 'CREDENTIALS' }, config);
    credential = { accountId: account.id, ...envelope, refreshState: 'READY', expiresAt: new Date(Date.now() + 3600_000) };
  }
  reseal();
  const tx = { select() {
    let table: unknown;
    const chain = { from(value: unknown) { table = value; return this; }, where() { return this; }, for() { return this; }, then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(table === users ? [user] : table === socialAccounts ? [account] : table === vkCredentials ? [credential] : table === socialBindings ? [] : []).then(resolve); } };
    return chain;
  } } as unknown as ConnectionTransaction;
  globals.__planlyDb = { transaction: (operation: (value: ConnectionTransaction) => unknown) => operation(tx) };
  let credentialReads = 0;
  const client = { release() {}, async query(sql: string) {
    if(sql.startsWith('SELECT id,user_id'))return {rows:[{id:account.id,user_id:account.userId,provider:'VK',enabled:account.enabled,connection_status:account.connectionStatus}]};
    if(sql.startsWith('SELECT ciphertext')) { credentialReads++; return {rows:[{ciphertext:credential.ciphertext,iv:credential.iv,tag:credential.tag,key_version:credential.keyVersion,expires_at:credential.expiresAt,refresh_state:credential.refreshState}]}; }
    return {rows:[],rowCount:1};
  } };
  globals.__planlyPool = {connect:async()=>client};
  return { tx, user, account, token, reseal, grant, get credential() { return credential; },get credentialReads(){return credentialReads;} };
}

test('registered VK USER admission freezes an owned encrypted OAuth grant revision and destination', async () => {
  const f = fixture();
  assert.deepEqual(await capturePublicationBinding(f.tx, f.user.id, f.account.id, 'VK'), { socialBindingRevision: 4, socialBindingDestinationId: '-123' });
});

for (const fault of ['foreign-user', 'epoch', 'generation', 'revision', 'destination', 'config', 'disabled', 'blocked', 'expired', 'uncertain', 'unbound'] as const) {
  test(`registered VK USER admission denies ${fault} grant before any provider transport`, async () => {
    const f = fixture();
    if (fault === 'foreign-user') f.reseal({ userId: 'agent-b' });
    if (fault === 'epoch') f.user.sessionVersion++;
    if (fault === 'generation') f.account.connectionGeneration++;
    if (fault === 'revision') f.account.bindingRevision++;
    if (fault === 'destination') f.account.providerAccountId = '-456';
    if (fault === 'config') process.env.VK_CLIENT_ID = '654321';
    if (fault === 'disabled') f.account.enabled = false;
    if (fault === 'blocked') f.user.accessState = 'BLOCKED';
    if (fault === 'expired') Object.assign(f.user, { accessExpiresAt: new Date(0) });
    if (fault === 'uncertain') f.credential.refreshState = 'UNCERTAIN';
    if (fault === 'unbound') f.reseal({ revision: undefined });
    let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('Unexpected transport'); };
    await assert.rejects(() => capturePublicationBinding(f.tx, f.user.id, f.account.id, 'VK'), { name: 'ForbiddenError' });
    assert.equal(calls, 0);
  });
}

test('VK USER observation rejects another account owner even when account IDs are supplied directly', async () => {
  const f = fixture(); f.account.userId = 'agent-b';
  assert.equal(await observePublicationAuthorization(f.user.id, f.account.id, { socialBindingRevision: 4, socialBindingDestinationId: '-123' }), null);
});

test('VK final handoff validates community and passes the same pinned credential exactly once', async () => {
  const f=fixture();
  const observed=await observePublicationAuthorization(f.user.id,f.account.id,{socialBindingRevision:4,socialBindingDestinationId:'-123'});assert.ok(observed);
  const reads:string[]=[];
  globalThis.fetch=async(url,init)=>{reads.push(String(url));assert.equal(new URLSearchParams(String(init?.body)).get('access_token'),f.token);return Response.json({response:{groups:[{id:123,type:'page',is_admin:1,admin_level:2,name:'Fixture community'}]}});};
  let starts=0;
  const started=await beginVerifiedProviderHandoff(observed,{provider:'VK',publicationId:'vk-publication',socialAccountId:f.account.id,destinationId:'-123',text:'Fixture'},async(token)=>{starts++;assert.equal(token,f.token);return 'sent';});
  assert.ok(started && !('rejection' in started));assert.deepEqual(await started.outcome,{ok:true,value:'sent'});assert.equal(starts,1);assert.equal(f.credentialReads,1);assert.deepEqual(reads,['https://api.vk.com/method/groups.getById']);
});

for(const fault of ['revoked','epoch','destination','generation','revision','credential'] as const)test(`VK final handoff denies ${fault} change during provider control check`,async()=>{
  const f=fixture();const observed=await observePublicationAuthorization(f.user.id,f.account.id,{socialBindingRevision:4,socialBindingDestinationId:'-123'});assert.ok(observed);
  globalThis.fetch=async()=>{
    if(fault==='revoked')f.account.enabled=false;
    if(fault==='epoch')f.user.sessionVersion++;
    if(fault==='destination')f.account.providerAccountId='-456';
    if(fault==='generation')f.account.connectionGeneration++;
    if(fault==='revision')f.account.bindingRevision++;
    if(fault==='credential')f.credential.ciphertext='invalid';
    return Response.json({response:{groups:[{id:123,type:'page',is_admin:1,admin_level:2,name:'Fixture community'}]}});
  };
  let starts=0;const started=await beginVerifiedProviderHandoff(observed,{provider:'VK',publicationId:'vk-publication',socialAccountId:f.account.id,destinationId:'-123',text:'Fixture'},async()=>{starts++;return 'sent';});
  assert.equal(started,null);assert.equal(starts,0);
});

for(const [code,label] of [[1051,'VK_METHOD_PROFILE_DENIED'],[15,'VK_API_ACCESS_NOT_GRANTED'],[27,'VK_GROUP_TOKEN_METHOD_DENIED']] as const)test(`VK read-only preflight ${code} preserves its closed provider diagnosis without dispatch`,async()=>{
  const f=fixture(),observed=await observePublicationAuthorization(f.user.id,f.account.id,{socialBindingRevision:4,socialBindingDestinationId:'-123'});assert.ok(observed);
  const secret='secret-provider-echo';
  globalThis.fetch=async()=>Response.json({error:{error_code:code,error_msg:secret,request_params:[{value:secret}]}});
  let starts=0;const started=await beginVerifiedProviderHandoff(observed,{provider:'VK',publicationId:'vk-publication',socialAccountId:f.account.id,destinationId:'-123',text:'Fixture'},async()=>{starts++;return 'sent';});
  assert.ok(started && 'rejection' in started);
  assert.equal(started.rejection.ok,false);assert.equal(started.rejection.errorType,'PERMANENT');assert.equal(started.rejection.code,label);
  assert.deepEqual(started.rejection.vkDiagnostic,{stage:'COMMUNITY_VALIDATION',method:'groups.getById',vkErrorCode:code});
  assert.equal(starts,0);assert.equal(JSON.stringify(started).includes(secret),false);
});

test('VK credential transport exception remains a safe admission denial with no dispatch',async()=>{
  const f=fixture(),observed=await observePublicationAuthorization(f.user.id,f.account.id,{socialBindingRevision:4,socialBindingDestinationId:'-123'});assert.ok(observed);
  globals.__planlyPool={async connect(){throw new Error('secret-credential-transport');}};
  let starts=0;const started=await beginVerifiedProviderHandoff(observed,{provider:'VK',publicationId:'vk-publication',socialAccountId:f.account.id,destinationId:'-123',text:'Fixture'},async()=>{starts++;return 'sent';});
  assert.equal(started,null);assert.equal(starts,0);
});

test('VK OAuth callback accepts an authenticated non-owner for safe provider-denial feedback', async () => {
  fixture();
  const chain = { from() { return this; }, innerJoin() { return this; }, where() { return this; }, async limit() { return [{ id: 'agent-a', email: 'agent-a@example.test', displayName: 'Agent A' }]; } };
  globals.__planlyDb = { select: () => chain, update: () => ({ set: () => ({ async where() {} }) }) };
  Object.assign(process.env, { SESSION_SECRET: 'fixture-session-key-of-at-least-32-characters', OWNER_PASSWORD_HASH: 'fixture-password-hash' });
  const { resetServerEnvForTests } = await import('../lib/server/env.ts'); resetServerEnvForTests();
  const { GET } = await import('../app/api/social-accounts/vk/callback/route.ts');
  const warn = console.warn; console.warn = () => {};
  try {
    const response = await GET(new Request('https://lentaro.example.test/api/social-accounts/vk/callback?error=access_denied', { headers: { cookie: 'planly_session=fixture-synthetic-session' } }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), 'https://lentaro.example.test/?vk=reconnect#settings');
  } finally { console.warn = warn; resetServerEnvForTests(); }
});

test('authenticated session principal carries the current epoch into VK OAuth lifecycle admission', async () => {
  fixture(); Object.assign(process.env, { SESSION_SECRET: 'fixture-session-key-of-at-least-32-characters', OWNER_PASSWORD_HASH: 'fixture-password-hash' });
  globals.__planlyDb = { select(selection: Record<string, unknown>) {
    const principal = Object.fromEntries(Object.keys(selection).map(key => [key, ({ id: 'agent-a', email: 'agent-a@example.test', displayName: 'Agent A', sessionVersion: 7 } as Record<string, unknown>)[key]]));
    return { from() { return this; }, innerJoin() { return this; }, where() { return this; }, async limit() { return [principal]; } };
  }, update: () => ({ set: () => ({ async where() {} }) }) };
  const { resetServerEnvForTests } = await import('../lib/server/env.ts'); resetServerEnvForTests();
  const { getOwnerBySessionToken } = await import('../lib/server/auth/session.ts');
  try { assert.equal((await getOwnerBySessionToken('fixture-synthetic-session'))?.sessionVersion, 7); }
  finally { resetServerEnvForTests(); }
});
