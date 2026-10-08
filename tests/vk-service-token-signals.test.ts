import test from 'node:test';
import assert from 'node:assert/strict';
import { requestVkGrant } from '../lib/server/vk/oauth.ts';
import { VkOAuthError } from '../lib/server/vk/config.ts';
import { logVkOAuthFailure } from '../lib/server/vk/diagnostics.ts';

// Synthetic sentences exercise diagnostic vocabulary, not observed VK wording or causes.
const base = { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'TOKEN_EXCHANGE', reason: 'INVALID_GRANT', invalidGrantReason: 'OTHER_INVALID_GRANT' };
const metadata = { providerHttpStatus: 200, providerDescriptionState: 'PRESENT', providerDescriptionMentions: ['SERVICE_TOKEN'] };
const config = { clientId: '54809575', serviceToken: 'synthetic-private-service', redirectUri: 'https://example.test/callback', encryptionKey: '', keyVersion: '1' };

async function exchange(description: unknown, grantType = 'authorization_code', providerError = 'invalid_grant') {
  const originalFetch = globalThis.fetch; const originalWarn = console.warn; const logs: string[] = [];
  globalThis.fetch = async () => Response.json({ error: providerError, error_description: description, access_token: 'synthetic-private-access' });
  console.warn = (message: string) => { logs.push(message); };
  try {
    await assert.rejects(() => requestVkGrant({ grant_type: grantType, code: 'synthetic-private-code' }, config), error => {
      assert.ok(error instanceof VkOAuthError); logVkOAuthFailure(error);
      assert.equal(JSON.stringify(error).includes('synthetic-private'), false);
      return true;
    });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].includes('synthetic-private'), false);
    return JSON.parse(logs[0]);
  } finally { globalThis.fetch = originalFetch; console.warn = originalWarn; }
}

for (const [name, description, terms] of [
  ['invalid', 'Invalid SERVICE_TOKEN.', ['INVALID']],
  ['required and absent', 'service_token missing; required.', ['MISSING', 'REQUIRED']],
  ['expired and revoked', 'service_token expired or revoked.', ['EXPIRED', 'REVOKED']],
  ['IP restriction', 'service_token: IP address is not allowed.', ['IP', 'RESTRICTED', 'ALLOWLIST']],
  ['application and confidentiality', 'service_token required for confidential client_id.', ['REQUIRED', 'APPLICATION', 'CONFIDENTIAL']],
  ['all bounded terms once', 'service_token INVALID incorrect missing required expired revoked IP client_id confidential forbidden whitelist INVALID', ['INVALID', 'MISSING', 'REQUIRED', 'EXPIRED', 'REVOKED', 'IP', 'APPLICATION', 'CONFIDENTIAL', 'RESTRICTED', 'ALLOWLIST']],
  ['negative wording remains lexical', 'service_token is not invalid; IP is allowed.', ['INVALID', 'IP', 'ALLOWLIST']],
  ['private provider echo', 'service_token=synthetic-private-service; invalid IP=synthetic-private-ip; client_id=synthetic-private-client', ['INVALID', 'IP', 'APPLICATION']],
] as const) {
  test(`service-token description retains only fixed lexical terms: ${name}`, async () => {
    assert.deepEqual(await exchange(description), { ...base, ...metadata, providerServiceTokenTerms: terms });
  });
}

for (const [name, description, state, mentions] of [
  ['no recognized terms', 'service_token: synthetic-private-detail', 'PRESENT', ['SERVICE_TOKEN']],
  ['no service-token mention', 'invalid client_id IP confidential', 'PRESENT', []],
  ['identifier substrings', 'service_token invalid2 ip_suffix my_client_id confidential_app required_extra', 'PRESENT', ['SERVICE_TOKEN']],
  ['non-string', { service_token: 'invalid' }, 'NON_STRING', []],
  ['oversized', 'service_token invalid IP ' + 'x'.repeat(4096), 'TOO_LONG', []],
] as const) {
  test(`service-token terms are omitted for ${name}`, async () => {
    assert.deepEqual(await exchange(description), { ...base, providerHttpStatus: 200, providerDescriptionState: state, providerDescriptionMentions: mentions });
  });
}

test('service-token terms do not extend refresh or other provider-error diagnostics', async () => {
  assert.deepEqual(await exchange('Invalid service_token', 'refresh_token'), base);
  assert.deepEqual(await exchange('Invalid service_token', 'authorization_code', 'invalid_client'), { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'TOKEN_EXCHANGE', reason: 'INVALID_CLIENT' });
});

test('logger rejects unknown sparse oversized and non-array service-token terms without reflecting values', () => {
  const originalWarn = console.warn; const logs: string[] = []; console.warn = (message: string) => { logs.push(message); };
  try {
    const error = new VkOAuthError('AUTH', { stage: 'TOKEN_EXCHANGE', reason: 'INVALID_GRANT' });
    for (const terms of [['INVALID', 'synthetic-private'], Array(1), Array(11).fill('IP'), 'synthetic-private', null]) {
      Object.assign(error, { tokenExchangeMetadata: { ...metadata, providerServiceTokenTerms: terms } }); logVkOAuthFailure(error);
      assert.deepEqual(JSON.parse(logs.at(-1)!), { ...base, ...metadata });
    }
    Object.assign(error, { tokenExchangeMetadata: { ...metadata, providerServiceTokenTerms: ['IP', 'IP'], raw: 'synthetic-private' } }); logVkOAuthFailure(error);
    assert.deepEqual(JSON.parse(logs.at(-1)!), { ...base, ...metadata, providerServiceTokenTerms: ['IP'] });
    Object.assign(error, { tokenExchangeMetadata: { ...metadata, providerDescriptionMentions: ['PKCE'], providerServiceTokenTerms: ['IP'] } }); logVkOAuthFailure(error);
    assert.deepEqual(JSON.parse(logs.at(-1)!), { ...base, ...metadata, providerDescriptionMentions: ['PKCE'] });
    Object.assign(error, { tokenExchangeMetadata: { ...metadata, providerDescriptionState: 'EMPTY', providerServiceTokenTerms: ['IP'] } }); logVkOAuthFailure(error);
    assert.deepEqual(JSON.parse(logs.at(-1)!), { ...base, ...metadata, providerDescriptionState: 'EMPTY' });
    assert.equal(JSON.stringify(logs).includes('synthetic-private'), false);
  } finally { console.warn = originalWarn; }
});
