import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { POST } from '../app/api/social-accounts/vk/start/route.ts';
import { resetServerEnvForTests } from '../lib/server/env.ts';

const require = createRequire(import.meta.url);
const NextNodeServer = require('next/dist/server/next-server.js').default;
const { NextRequestAdapter } = require('next/dist/server/web/spec-extension/adapters/next-request.js');
const publicOrigin = 'https://planly.example.test';

// Catch using Next's internal listen URL or untrusted forwarding headers as CSRF authority.
for (const [label, origin, host, redirectUri, status] of [
  ['public origin behind HTTPS proxy', publicOrigin, 'planly.example.test', `${publicOrigin}/api/social-accounts/vk/callback`, 200],
  ['foreign origin', 'https://other.example.test', 'planly.example.test', `${publicOrigin}/api/social-accounts/vk/callback`, 401],
  ['spoofed host and forwarded host', 'https://other.example.test', 'other.example.test', `${publicOrigin}/api/social-accounts/vk/callback`, 401],
  ['wrong scheme', 'http://planly.example.test', 'planly.example.test', `${publicOrigin}/api/social-accounts/vk/callback`, 401],
  ['wrong port', 'https://planly.example.test:444', 'planly.example.test', `${publicOrigin}/api/social-accounts/vk/callback`, 401],
  ['subdomain', 'https://other.planly.example.test', 'planly.example.test', `${publicOrigin}/api/social-accounts/vk/callback`, 401],
  ['invalid public configuration', publicOrigin, 'planly.example.test', 'invalid', 503],
] as const) {
  test(`VK start ${label}: real Next adapter and owner route return ${status}`, async () => {
    const globals = globalThis as typeof globalThis & { __planlyDb?: unknown; __planlyPool?: unknown };
    const savedDb = globals.__planlyDb; const savedPool = globals.__planlyPool;
    const env = {
      OWNER_EMAIL: 'origin@example.test', OWNER_PASSWORD_HASH: 'scrypt$1$synthetic', SESSION_SECRET: randomBytes(32).toString('hex'),
      VK_CLIENT_ID: '54809575', VK_SERVICE_TOKEN: randomBytes(32).toString('hex'), VK_REDIRECT_URI: redirectUri,
      VK_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'), VK_CREDENTIAL_KEY_VERSION: '1',
    };
    const savedEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
    Object.assign(process.env, env); resetServerEnvForTests();
    // Only PostgreSQL/session transport is replaced; owner, config, adapter, guard and intent encryption are real.
    const chain = { from() { return this; }, innerJoin() { return this; }, where() { return this; }, async limit() { return [{ id: 'origin-owner', email: 'origin@example.test', displayName: 'Origin' }]; } };
    globals.__planlyDb = { select: () => chain };
    let intentWrites = 0; let connections = 0; let providerCalls = 0;
    const client = { release() {}, async query(sql: string, values: unknown[] = []) {
      if (sql.startsWith('SELECT id,user_id')) {
        assert.deepEqual(values, ['origin-account']);
        return { rows: [{ id: 'origin-account', user_id: 'origin-owner', provider: 'VK', enabled: false, connection_status: 'DISCONNECTED' }] };
      }
      if (sql.startsWith('INSERT INTO vk_oauth_intents')) {
        intentWrites++;
        assert.equal(values[1], 'origin-owner'); assert.equal(values[2], 'origin-account'); assert.equal(values[3], '242095689');
      } else if (!sql.startsWith('SELECT pg_advisory_') && !sql.startsWith('DELETE FROM vk_oauth_intents') && !['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
        throw new Error('Unexpected SQL boundary');
      }
      return { rows: [], rowCount: 1 };
    } };
    globals.__planlyPool = { async connect() { connections++; return client; } };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { providerCalls++; throw new Error('Unexpected provider call'); };
    try {
      const incoming = {
        url: '/api/social-accounts/vk/start', method: 'POST', body: JSON.stringify({ accountId: 'origin-account', communityId: '242095689' }),
        headers: { origin, host, 'x-forwarded-host': host, 'x-forwarded-proto': 'https', 'content-type': 'application/json', cookie: `planly_session=${randomBytes(32).toString('hex')}` },
      };
      // URL metadata is the actual Next implementation with the Docker listen host; body transport is irrelevant here.
      NextNodeServer.prototype.attachRequestMeta.call({ fetchHostname: '0.0.0.0', port: 10000, nextConfig: { experimental: {} } }, incoming, { query: {} }, true);
      const request: Request = NextRequestAdapter.fromNodeNextRequest(incoming, new AbortController().signal);
      assert.equal(new URL(request.url).origin, 'https://0.0.0.0:10000');
      const response = await POST(request);
      assert.equal(response.status, status);
      const body = await response.json();
      if (status === 200) {
        const authorization = new URL(body.authorizationUrl);
        assert.equal(authorization.origin, 'https://id.vk.ru');
        assert.equal(authorization.searchParams.get('redirect_uri'), 'https://planly.example.test/api/social-accounts/vk/callback');
        assert.equal(authorization.searchParams.get('scope'), 'wall photos');
        assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
        assert.equal(intentWrites, 1);
      } else {
        assert.deepEqual(body, status === 401 ? { error: 'Unauthorized' } : { error: 'VK setup is required.', code: 'CONFIG' });
        assert.equal(intentWrites, 0); assert.equal(connections, 0);
      }
      assert.equal(providerCalls, 0);
    } finally {
      globalThis.fetch = originalFetch; globals.__planlyDb = savedDb; globals.__planlyPool = savedPool;
      for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      resetServerEnvForTests();
    }
  });
}
