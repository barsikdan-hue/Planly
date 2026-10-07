import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

type Grant = { accessToken: string; refreshToken: string; expiresIn: number; scopes: string[] };
async function oauthModule(): Promise<{ parseVkGrant: (raw: unknown) => Grant; VkOAuthError: new (code: string) => Error & { code: string } }> {
  const path = '../lib/server/vk/oauth.ts'; const loaded = await import(path).catch(() => null);
  assert.ok(loaded?.parseVkGrant && loaded?.VkOAuthError, 'VK OAuth grant validation feature is missing');
  return loaded;
}
function grant(scope: unknown = 'wall photos') {
  return { access_token: randomBytes(24).toString('hex'), refresh_token: randomBytes(24).toString('hex'), expires_in: 3600, scope };
}

test('OAuth grant requires explicit wall and photos scopes and a complete rotating pair', async () => {
  const api = await oauthModule(); const fixture = grant(); const result = api.parseVkGrant(fixture);
  assert.ok(result.accessToken === fixture.access_token && result.refreshToken === fixture.refresh_token, 'grant pair was not preserved');
  assert.deepEqual(result.scopes, ['wall', 'photos']); assert.equal(result.expiresIn, 3600);
  for (const scope of [undefined, '', 'wall', 'photos', 'wallpaper photos']) assert.throws(() => api.parseVkGrant({ ...grant(), scope }));
  for (const raw of [{ ...grant(), access_token: '' }, { ...grant(), refresh_token: '' }, { ...grant(), expires_in: -1 }, { ...grant(), expires_in: '3600' }]) assert.throws(() => api.parseVkGrant(raw));
});

test('provider error echoes never become public OAuth diagnostics', async () => {
  const api = await oauthModule(); const echo = randomBytes(24).toString('hex');
  let failure: unknown;
  try { api.parseVkGrant({ error: 'invalid_grant', error_description: echo, request_params: [{ value: echo }] }); } catch (error) { failure = error; }
  assert.ok(failure instanceof api.VkOAuthError);
  const error = failure as Error & { code: string; cause?: unknown };
  assert.equal(error.code, 'AUTH'); assert.equal(error.cause, undefined);
  assert.equal(JSON.stringify(error).includes(echo), false); assert.equal(String(error).includes(echo), false);
});

test('OAuth grant rejects whitespace and control characters in either rotating token', async () => {
  const api = await oauthModule();
  for (const field of ['access_token', 'refresh_token']) {
    const generated = randomBytes(24).toString('hex');
    for (const value of [' ', '\t\r\n', `${generated} `, `${generated}\0`, `${generated}\x1f`, `${generated}\x7f`, `${generated}\u00a0`]) {
      assert.throws(() => api.parseVkGrant({ ...grant(), [field]: value }), error => error instanceof api.VkOAuthError && error.code === 'AUTH');
    }
  }
});

test('VK config enforces static server key version redirect and app credentials', async () => {
  const path = '../lib/server/vk/config.ts'; const loaded = await import(path).catch(() => null);
  assert.ok(loaded?.getVkConfig, 'VK strict server configuration feature is missing');
  const env = { VK_CLIENT_ID: '123456', VK_SERVICE_TOKEN: randomBytes(24).toString('hex'), VK_REDIRECT_URI: 'https://planly.example.test/api/social-accounts/vk/callback', VK_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'), VK_CREDENTIAL_KEY_VERSION: '1' };
  assert.doesNotThrow(() => loaded.getVkConfig(env));
  for (const field of Object.keys(env)) assert.throws(() => loaded.getVkConfig({ ...env, [field]: '' }));
  assert.throws(() => loaded.getVkConfig({ ...env, VK_REDIRECT_URI: 'javascript:alert(1)' }));
  assert.throws(() => loaded.getVkConfig({ ...env, VK_CREDENTIAL_ENCRYPTION_KEY: randomBytes(31).toString('base64') }));
});
