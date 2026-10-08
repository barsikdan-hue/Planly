import test from 'node:test';
import assert from 'node:assert/strict';
import { requestVkGrant } from '../lib/server/vk/oauth.ts';
import { VkOAuthError } from '../lib/server/vk/config.ts';
import { logVkOAuthFailure } from '../lib/server/vk/diagnostics.ts';

// Synthetic descriptions define a conservative classifier, not a claim about the observed VK response.
const cases = [
  ['code_challenge does not match code_verifier', 'PKCE_MISMATCH', ['PKCE']],
  ['code_verifier is invalid', 'CODE_VERIFIER_REJECTED', ['PKCE']],
  ['code is invalid or expired', 'CODE_INVALID_EXPIRED_OR_USED', ['CODE']],
  ['code was already used', 'CODE_INVALID_EXPIRED_OR_USED', ['CODE']],
  ['device_id is invalid', 'DEVICE_ID_REJECTED', ['DEVICE_ID']],
  ['redirect_uri is invalid, please pass same redirect_uri, you used in authorize method.', 'REDIRECT_REJECTED', ['REDIRECT_URI']],
  ['service_token is invalid', 'SERVICE_TOKEN_REJECTED', ['SERVICE_TOKEN']],
] as const;
const config = { clientId: '54809575', serviceToken: 'synthetic-service', redirectUri: 'https://planly.example.test/callback', encryptionKey: '', keyVersion: '1' };

async function exchange(description: unknown) {
  const originalFetch = globalThis.fetch; const originalWarn = console.warn;
  const logs: unknown[][] = [];
  globalThis.fetch = async () => Response.json({ error: 'invalid_grant', error_description: description, access_token: 'synthetic-private-echo' }, { status: 400 });
  console.warn = (...args: unknown[]) => { logs.push(args); };
  try {
    await assert.rejects(() => requestVkGrant({ grant_type: 'authorization_code', code: 'synthetic-code', state: 'synthetic-state' }, config), error => {
      assert.ok(error instanceof VkOAuthError);
      assert.equal(error.code, 'AUTH');
      assert.deepEqual(error.diagnostic, { stage: 'TOKEN_EXCHANGE', reason: 'INVALID_GRANT' });
      logVkOAuthFailure(error); return true;
    });
    assert.equal(logs.length, 1); assert.equal(logs[0].length, 1);
    assert.ok(!JSON.stringify(logs).includes('synthetic-private-echo'), 'provider body must not be retained');
    return JSON.parse(String(logs[0][0]));
  } finally { globalThis.fetch = originalFetch; console.warn = originalWarn; }
}

for (const [description, category, mentions] of cases) {
  test(`invalid grant logs only the fixed ${category} category`, async () => {
    assert.deepEqual(await exchange(description), { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'TOKEN_EXCHANGE', reason: 'INVALID_GRANT', invalidGrantReason: category, providerHttpStatus: 400, providerDescriptionState: 'PRESENT', providerDescriptionMentions: mentions, ...(description === 'service_token is invalid' ? { providerServiceTokenTerms: ['INVALID'] } : {}) });
  });
}

test('absent unknown malformed and secret-bearing descriptions remain OTHER_INVALID_GRANT', async () => {
  for (const [value, state, mentions] of [
    [undefined, 'MISSING', []], [null, 'NON_STRING', []], [{}, 'NON_STRING', []], [['code_verifier is invalid'], 'NON_STRING', []], [42, 'NON_STRING', []],
    ['', 'EMPTY', []], ['unknown', 'PRESENT', []], ['code_verifier is invalid synthetic-private-echo', 'PRESENT', ['PKCE']],
    ['synthetic-private-echo code_verifier is invalid', 'PRESENT', ['PKCE']], ['code_verifier is invalid\n', 'PRESENT', ['PKCE']], ['x'.repeat(100_000), 'TOO_LONG', []],
  ] as const) {
    const logged = await exchange(value);
    assert.deepEqual(logged, { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'TOKEN_EXCHANGE', reason: 'INVALID_GRANT', invalidGrantReason: 'OTHER_INVALID_GRANT', providerHttpStatus: 400, providerDescriptionState: state, providerDescriptionMentions: mentions });
  }
});

test('logger rechecks a mutated classification and omits it at other boundaries', () => {
  const logs: unknown[][] = []; const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { logs.push(args); };
  try {
    const error = new VkOAuthError('AUTH', { stage: 'TOKEN_EXCHANGE', reason: 'INVALID_GRANT' });
    Object.assign(error, { invalidGrantReason: 'synthetic-private-echo' }); logVkOAuthFailure(error);
    assert.deepEqual(JSON.parse(String(logs[0][0])), { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'TOKEN_EXCHANGE', reason: 'INVALID_GRANT', invalidGrantReason: 'OTHER_INVALID_GRANT' });
    Object.assign(error, { diagnostic: { stage: 'CALLBACK', reason: 'INVALID_GRANT' }, invalidGrantReason: 'PKCE_MISMATCH' }); logVkOAuthFailure(error);
    assert.deepEqual(JSON.parse(String(logs[1][0])), { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'CALLBACK', reason: 'INVALID_GRANT' });
    assert.ok(!JSON.stringify(logs).includes('synthetic-private-echo'), 'mutated data must not be reflected');
  } finally { console.warn = originalWarn; }
});
