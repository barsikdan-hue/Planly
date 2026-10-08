import test from 'node:test';
import assert from 'node:assert/strict';
import { requestVkGrant } from '../lib/server/vk/oauth.ts';
import { VkOAuthError } from '../lib/server/vk/config.ts';
import { logVkOAuthFailure } from '../lib/server/vk/diagnostics.ts';

const config = { clientId: '54809575', serviceToken: 'synthetic-service-private', redirectUri: 'https://planly.example.test/callback', encryptionKey: Buffer.alloc(32, 9).toString('base64'), keyVersion: '1' };
const fields = { grant_type: 'authorization_code', code: 'synthetic-code-private', device_id: 'synthetic-device-private', state: 'synthetic-state-private', code_verifier: 'synthetic-verifier-private' };
const base = { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'TOKEN_EXCHANGE', reason: 'INVALID_GRANT', invalidGrantReason: 'OTHER_INVALID_GRANT' };

async function exchange(description: unknown, status = 400, requestFields = fields) {
  const originalFetch = globalThis.fetch; const originalWarn = console.warn;
  const logs: unknown[][] = []; let request: { url: string; init?: RequestInit } | undefined; let failure: VkOAuthError | undefined;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return Response.json({ error: 'invalid_grant', error_description: description, access_token: 'synthetic-access-private', refresh_token: 'synthetic-refresh-private', ignored: 'synthetic-body-private' }, { status });
  };
  console.warn = (...args: unknown[]) => { logs.push(args); };
  try {
    await assert.rejects(() => requestVkGrant(requestFields, config), error => {
      assert.ok(error instanceof VkOAuthError); failure = error;
      assert.equal(error.code, 'AUTH');
      assert.deepEqual(error.diagnostic, { stage: 'TOKEN_EXCHANGE', reason: 'INVALID_GRANT' });
      logVkOAuthFailure(error); return true;
    });
    assert.equal(logs.length, 1); assert.equal(logs[0].length, 1);
    const serialized = JSON.stringify({ logs, failure });
    for (const secret of [...Object.values(fields).filter(v => v !== 'authorization_code'), config.serviceToken, config.encryptionKey, 'synthetic-access-private', 'synthetic-refresh-private', 'synthetic-body-private']) {
      assert.equal(serialized.includes(secret), false, 'private exchange data must not reach logs or the retained error');
    }
    return { logged: JSON.parse(String(logs[0][0])), request };
  } finally { globalThis.fetch = originalFetch; console.warn = originalWarn; }
}

// Literal expectations distinguish absence/type/emptiness from an unrecognized provider sentence.
for (const [name, description, state, mentions] of [
  ['absent description', undefined, 'MISSING', []],
  ['null description', null, 'NON_STRING', []],
  ['object description', { code_verifier: 'synthetic-description-private' }, 'NON_STRING', []],
  ['array description', ['code_verifier'], 'NON_STRING', []],
  ['empty description', '', 'EMPTY', []],
  ['whitespace description', ' \r\n\t ', 'EMPTY', []],
  ['unrecognized sentence', 'Authentication cannot be completed', 'PRESENT', []],
  ['unrecognized PKCE sentence', 'Authentication failed: CODE_VERIFIER did not satisfy PKCE requirement.', 'PRESENT', ['PKCE']],
  ['multiple parameter mentions', 'Authorization code was rejected for device_id and redirect_uri, service_token.', 'PRESENT', ['CODE', 'DEVICE_ID', 'REDIRECT_URI', 'SERVICE_TOKEN']],
  ['PKCE parameters without an independent code mention', 'code_challenge is invalid; code_verifier is rejected', 'PRESENT', ['PKCE']],
  ['parameter substrings inside other identifiers', 'decode codec code_verifier_suffix my_device_id redirect_uri2 service_token_extra', 'PRESENT', []],
  ['oversized description', 'code_verifier ' + 'x'.repeat(4096), 'TOO_LONG', []],
] as const) {
  test(`invalid grant distinguishes ${name} without claiming its cause`, async () => {
    const { logged } = await exchange(description);
    assert.deepEqual(logged, { ...base, providerHttpStatus: 400, providerDescriptionState: state, providerDescriptionMentions: mentions });
  });
}

test('provider error on HTTP 200 is retained as a rejected grant with its actual status', async () => {
  assert.deepEqual((await exchange(undefined, 200)).logged, { ...base, providerHttpStatus: 200, providerDescriptionState: 'MISSING', providerDescriptionMentions: [] });
});

test('secret-bearing descriptions retain only mention enums, never text, values or URLs', async () => {
  const description = `PKCE code_verifier=${fields.code_verifier}; code=${fields.code}; device_id=${fields.device_id}; redirect_uri=https://example.test/?state=${fields.state}; service_token=${config.serviceToken}; access_token=synthetic-access-private; encryption_key=${config.encryptionKey}`;
  const { logged } = await exchange(description);
  assert.deepEqual(logged, { ...base, providerHttpStatus: 400, providerDescriptionState: 'PRESENT', providerDescriptionMentions: ['PKCE', 'CODE', 'DEVICE_ID', 'REDIRECT_URI', 'SERVICE_TOKEN'] });
  assert.equal(JSON.stringify(logged).includes('https://'), false);
  assert.equal(JSON.stringify(logged).includes(description), false);
});

test('diagnostics preserve the exact exchange form, endpoint and request protections', async () => {
  const { request } = await exchange('Unrecognized VK response');
  assert.ok(request);
  assert.equal(request.url, 'https://id.vk.ru/oauth2/auth');
  assert.equal(request.init?.method, 'POST');
  assert.deepEqual(request.init?.headers, { 'Content-Type': 'application/x-www-form-urlencoded' });
  assert.equal(request.init?.redirect, 'error');
  assert.ok(request.init?.signal instanceof AbortSignal);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(String(request.init?.body))), { ...fields, client_id: '54809575', service_token: 'synthetic-service-private', redirect_uri: 'https://planly.example.test/callback' });
});

test('new authorization-code metadata does not alter refresh diagnostics', async () => {
  const refreshFields = { ...fields, grant_type: 'refresh_token' };
  assert.deepEqual((await exchange('Unrecognized VK response', 400, refreshFields)).logged, base);
});

test('logger revalidates all metadata and omits it outside the invalid-grant exchange boundary', () => {
  const logs: unknown[][] = []; const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { logs.push(args); };
  try {
    const error = new VkOAuthError('AUTH', { stage: 'TOKEN_EXCHANGE', reason: 'INVALID_GRANT' });
    const good = { providerHttpStatus: 400, providerDescriptionState: 'PRESENT', providerDescriptionMentions: ['PKCE'] };
    Object.assign(error, { tokenExchangeMetadata: good }); logVkOAuthFailure(error);
    assert.deepEqual(JSON.parse(String(logs.at(-1)?.[0])), { ...base, ...good });
    for (const bad of [
      { ...good, providerHttpStatus: 'synthetic-metadata-private' },
      { ...good, providerHttpStatus: 99 },
      { ...good, providerHttpStatus: 600 },
      { ...good, providerHttpStatus: 400.5 },
      { ...good, providerDescriptionState: 'synthetic-metadata-private' },
      { ...good, providerDescriptionMentions: ['PKCE', 'synthetic-metadata-private'] },
      { ...good, providerDescriptionMentions: 'PKCE' },
      { ...good, providerDescriptionMentions: Array(6).fill('PKCE') },
      { ...good, providerDescriptionMentions: Array(1) },
      'synthetic-metadata-private', null,
    ]) {
      Object.assign(error, { tokenExchangeMetadata: bad }); logVkOAuthFailure(error);
      assert.deepEqual(JSON.parse(String(logs.at(-1)?.[0])), base);
    }
    Object.assign(error, { tokenExchangeMetadata: { ...good, rawBody: 'synthetic-metadata-private' }, diagnostic: { stage: 'TOKEN_EXCHANGE', reason: 'INVALID_GRANT' } }); logVkOAuthFailure(error);
    assert.deepEqual(JSON.parse(String(logs.at(-1)?.[0])), { ...base, ...good });
    Object.assign(error, { diagnostic: { stage: 'CALLBACK', reason: 'INVALID_GRANT' } }); logVkOAuthFailure(error);
    assert.deepEqual(JSON.parse(String(logs.at(-1)?.[0])), { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'CALLBACK', reason: 'INVALID_GRANT' });
    Object.assign(error, { diagnostic: { stage: 'TOKEN_EXCHANGE', reason: 'INVALID_SCOPE' } }); logVkOAuthFailure(error);
    assert.deepEqual(JSON.parse(String(logs.at(-1)?.[0])), { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'TOKEN_EXCHANGE', reason: 'INVALID_SCOPE' });
    assert.equal(JSON.stringify(logs).includes('synthetic-metadata-private'), false);
  } finally { console.warn = originalWarn; }
});
