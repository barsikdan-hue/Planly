import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { completeVkOAuth, parseVkGrant, requestVkGrant, startVkOAuth } from '../lib/server/vk/oauth.ts';
import { VkOAuthError } from '../lib/server/vk/config.ts';
import { resetServerEnvForTests } from '../lib/server/env.ts';

const synthetic = () => randomBytes(24).toString('hex');
const config = () => ({ clientId: '54809575', serviceToken: synthetic(), redirectUri: 'https://planly.example.test/api/social-accounts/vk/callback', encryptionKey: randomBytes(32).toString('base64'), keyVersion: '1' });
const grant = (scope = 'wall photos') => ({ access_token: synthetic(), refresh_token: synthetic(), expires_in: 3600, scope });
function diagnostic(error: unknown, stage: string, reason: string): boolean {
  assert.ok(error instanceof VkOAuthError);
  assert.equal(error.code, 'AUTH');
  assert.deepEqual((error as VkOAuthError & { diagnostic?: unknown }).diagnostic, { stage, reason });
  assert.equal('cause' in error, false);
  return true;
}

for (const scope of ['vkid.personal_info', 'vkid.personal_info email phone', 'wall']) {
  test(`missing publishing scopes are identifiable while ${scope} remains rejected`, () => {
    assert.throws(() => parseVkGrant(grant(scope)), error => diagnostic(error, 'GRANT_VALIDATION', 'MISSING_PUBLISHING_SCOPES'));
  });
}

for (const [scenario, response, stage, reason] of [
  ['provider scope denial on HTTP 400', () => Response.json({ error: 'invalid_scope', error_description: synthetic() }, { status: 400 }), 'TOKEN_EXCHANGE', 'INVALID_SCOPE'],
  ['provider grant denial', () => Response.json({ error: 'invalid_grant', error_description: synthetic() }), 'TOKEN_EXCHANGE', 'INVALID_GRANT'],
  ['unknown provider denial', () => Response.json({ error: synthetic(), error_description: synthetic() }), 'TOKEN_EXCHANGE', 'PROVIDER_REJECTED'],
  ['HTTP rejection without JSON', () => new Response(synthetic(), { status: 503 }), 'TOKEN_EXCHANGE', 'HTTP_REJECTED'],
  ['malformed successful JSON', () => new Response(synthetic()), 'TOKEN_EXCHANGE', 'INVALID_RESPONSE'],
  ['basic grant', () => Response.json(grant('vkid.personal_info email phone')), 'GRANT_VALIDATION', 'MISSING_PUBLISHING_SCOPES'],
  ['malformed grant', () => Response.json({ access_token: synthetic() }), 'GRANT_VALIDATION', 'INVALID_RESPONSE'],
] as const) {
  test(`code exchange preserves a safe distinct cause for ${scenario}`, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => response();
    try { await assert.rejects(() => requestVkGrant({ grant_type: 'authorization_code', code: synthetic(), state: synthetic() }, config()), error => diagnostic(error, stage, reason)); }
    finally { globalThis.fetch = original; }
  });
}

test('transport exception URLs and bodies are replaced with a fixed exchange diagnostic', async () => {
  const echo = synthetic(); const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error(`https://provider.example.test/?code=${echo}`); };
  try {
    await assert.rejects(() => requestVkGrant({ code: echo }, config()), error => {
      diagnostic(error, 'TOKEN_EXCHANGE', 'TRANSPORT_FAILED');
      assert.equal(JSON.stringify(error).includes(echo), false);
      assert.equal(String(error).includes(echo), false);
      return true;
    });
  } finally { globalThis.fetch = original; }
});

test('exchange state mismatch is distinguishable without reflecting the state', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ...grant(), state: synthetic() });
  try { await assert.rejects(() => requestVkGrant({ state: synthetic() }, config()), error => diagnostic(error, 'TOKEN_EXCHANGE', 'STATE_MISMATCH')); }
  finally { globalThis.fetch = original; }
});

test('refresh still inherits omitted unchanged permissions and refuses an explicit downgrade', async () => {
  const original = globalThis.fetch;
  const replacement = grant(); delete (replacement as Partial<typeof replacement>).scope;
  globalThis.fetch = async () => Response.json(replacement);
  try {
    assert.deepEqual((await requestVkGrant({ grant_type: 'refresh_token' }, config(), ['wall', 'photos'])).scopes, ['wall', 'photos']);
    globalThis.fetch = async () => Response.json(grant('wall'));
    await assert.rejects(() => requestVkGrant({ grant_type: 'refresh_token' }, config(), ['wall', 'photos']), error => diagnostic(error, 'GRANT_VALIDATION', 'MISSING_PUBLISHING_SCOPES'));
  } finally { globalThis.fetch = original; }
});

test('failure logger emits only allowlisted metadata even when the error is forged or mutated', async () => {
  const path = '../lib/server/vk/diagnostics.ts'; const api = await import(path).catch(() => null);
  assert.ok(api?.logVkOAuthFailure, 'safe VK OAuth failure logger is missing');
  const echo = synthetic(); const captured: unknown[][] = []; const original = console.warn;
  console.warn = (...args: unknown[]) => { captured.push(args); };
  try {
    api.logVkOAuthFailure(new Error(echo));
    api.logVkOAuthFailure({ code: echo, diagnostic: { stage: echo, reason: echo } });
    const mutated = new VkOAuthError('AUTH');
    Object.assign(mutated, { code: echo, diagnostic: { stage: echo, reason: echo }, cause: { access_token: echo }, message: echo });
    api.logVkOAuthFailure(mutated);
    assert.equal(captured.length, 3);
    for (const args of captured) {
      assert.equal(args.length, 1);
      assert.deepEqual(JSON.parse(String(args[0])), { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'CALLBACK', reason: 'FAILED' });
    }
    assert.equal(JSON.stringify(captured).includes(echo), false);
  } finally { console.warn = original; }
});

for (const [providerError, reason] of [['invalid_scope', 'INVALID_SCOPE'], ['access_denied', 'ACCESS_DENIED'], [synthetic(), 'PROVIDER_REJECTED']] as const) {
  test(`authenticated callback denial ${reason} logs safely and never exchanges or connects`, async () => {
    const { GET } = await import('../app/api/social-accounts/vk/callback/route.ts');
    const globals = globalThis as typeof globalThis & { __planlyDb?: unknown; __planlyPool?: unknown };
    const savedDb = globals.__planlyDb; const savedPool = globals.__planlyPool;
    const keys = ['OWNER_EMAIL', 'OWNER_PASSWORD_HASH', 'SESSION_SECRET', 'VK_REDIRECT_URI'] as const;
    const savedEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    Object.assign(process.env, { OWNER_EMAIL: 'diagnostic@example.test', OWNER_PASSWORD_HASH: 'scrypt$1$synthetic', SESSION_SECRET: synthetic(), VK_REDIRECT_URI: 'https://planly.example.test/api/social-accounts/vk/callback' });
    resetServerEnvForTests();
    // Only the external session/DB boundary is replaced; route, owner check and logging are real.
    const chain = { from() { return this; }, innerJoin() { return this; }, where() { return this; }, async limit() { return [{ id: 'diagnostic-owner', email: 'diagnostic@example.test', displayName: 'Diagnostic' }]; } };
    globals.__planlyDb = { select: () => chain };
    let dbCalls = 0; let exchanges = 0;
    globals.__planlyPool = { async query() { dbCalls++; throw new Error('Unexpected DB access'); } };
    const fetchOriginal = globalThis.fetch; const logOriginal = console.warn; const logs: unknown[][] = [];
    globalThis.fetch = async () => { exchanges++; throw new Error('Unexpected provider request'); };
    console.warn = (...args: unknown[]) => { logs.push(args); };
    const echo = synthetic();
    try {
      const url = new URL(process.env.VK_REDIRECT_URI!);
      url.search = new URLSearchParams({ error: providerError, error_description: echo, state: echo, code: echo, device_id: echo }).toString();
      const response = await GET(new Request(url, { headers: { cookie: `planly_session=${synthetic()}` } }));
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), 'https://planly.example.test/?vk=reconnect#settings');
      assert.equal(exchanges, 0); assert.equal(dbCalls, 0); assert.equal(logs.length, 1);
      assert.deepEqual(JSON.parse(String(logs[0][0])), { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'CALLBACK', reason });
      assert.equal(JSON.stringify(logs).includes(echo), false);
      assert.equal(JSON.stringify([...response.headers]).includes(echo), false);
    } finally {
      globalThis.fetch = fetchOriginal; console.warn = logOriginal;
      globals.__planlyDb = savedDb; globals.__planlyPool = savedPool;
      for (const key of keys) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
      resetServerEnvForTests();
    }
  });
}

for (const [failure, expectedStage, expectedReason] of [
  ['intent', 'OAUTH_INTENT', 'FAILED'],
  ['scope', 'GRANT_VALIDATION', 'MISSING_PUBLISHING_SCOPES'],
  ['community', 'COMMUNITY_VALIDATION', 'FAILED'],
  ['persistence', 'CREDENTIAL_PERSISTENCE', 'FAILED'],
] as const) {
  test(`real OAuth completion identifies ${failure} failure without creating CONNECTED state`, async () => {
    const globals = globalThis as typeof globalThis & { __planlyPool?: unknown };
    const savedPool = globals.__planlyPool; const originalFetch = globalThis.fetch;
    const env = { VK_CLIENT_ID: '54809575', VK_SERVICE_TOKEN: synthetic(), VK_REDIRECT_URI: 'https://planly.example.test/api/social-accounts/vk/callback', VK_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'), VK_CREDENTIAL_KEY_VERSION: '1' };
    const savedEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
    Object.assign(process.env, env);
    const echo = synthetic(); let intent: Record<string, unknown> | undefined; let connectedWrites = 0; let credentialWrites = 0; let validations = 0;
    // The actual flow, encryption and error propagation run; only PostgreSQL transport is replaced.
    const client = { release() {}, async query(sql: string, values: unknown[] = []) {
      if (sql.startsWith('SELECT id,user_id')) return { rows: [{ id: 'diagnostic-account', user_id: 'diagnostic-owner', provider: 'VK', enabled: false, connection_status: 'DISCONNECTED' }] };
      if (sql.startsWith('INSERT INTO vk_oauth_intents')) intent = { state_hash: values[0], user_id: values[1], account_id: values[2], community_id: values[3], ciphertext: values[4], iv: values[5], tag: values[6], key_version: values[7], expires_at: values[8] };
      if (sql.startsWith('SELECT account_id FROM vk_oauth_intents')) {
        if (failure === 'intent') throw new Error(echo);
        return { rows: [{ account_id: 'diagnostic-account' }] };
      }
      if (sql.startsWith('SELECT * FROM vk_oauth_intents')) return { rows: [intent] };
      if (sql.startsWith('DELETE FROM vk_oauth_intents')) intent = undefined;
      if (sql.startsWith('INSERT INTO vk_credentials')) { credentialWrites++; throw new Error(echo); }
      if (sql.startsWith('UPDATE social_accounts')) connectedWrites++;
      return { rows: [], rowCount: 1 };
    } };
    globals.__planlyPool = { connect: async () => client, query: client.query };
    globalThis.fetch = async () => Response.json(grant(failure === 'scope' ? 'vkid.personal_info' : 'wall photos'));
    try {
      const started = await startVkOAuth('diagnostic-owner', 'diagnostic-account', '242095689');
      assert.equal(new URL(started.authorizationUrl).searchParams.get('scope'), 'wall photos');
      await assert.rejects(() => completeVkOAuth('diagnostic-owner', { state: new URL(started.authorizationUrl).searchParams.get('state')!, code: echo, deviceId: echo }, async () => {
        validations++;
        if (failure === 'community') throw new Error(echo);
        return { destinationId: '-242095689', displayName: 'Diagnostic community' };
      }), error => {
        diagnostic(error, expectedStage, expectedReason);
        assert.equal(JSON.stringify(error).includes(echo), false);
        return true;
      });
      assert.equal(connectedWrites, 0);
      assert.equal(validations, failure === 'community' || failure === 'persistence' ? 1 : 0);
      assert.equal(credentialWrites, failure === 'persistence' ? 1 : 0);
    } finally {
      globals.__planlyPool = savedPool; globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
}
