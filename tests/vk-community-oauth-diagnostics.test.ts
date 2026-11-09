import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVkCommunity, VkCommunityValidationError } from '../lib/server/connectors/vk.ts';
import { VkOAuthError } from '../lib/server/vk/config.ts';
import * as diagnostics from '../lib/server/vk/diagnostics.ts';

const privateEcho = 'synthetic-private-token-code-url-242095689';
const mapFailure = (error: unknown): VkOAuthError => {
  const mapper = (diagnostics as unknown as { vkCommunityOAuthFailure?: (value: unknown) => VkOAuthError }).vkCommunityOAuthFailure;
  assert.equal(typeof mapper, 'function', 'community failure must retain closed metadata at the OAuth catch boundary');
  return mapper!(error);
};
function logged(error: unknown): Record<string, unknown> {
  const lines: string[] = [], warn = console.warn;
  console.warn = (line: string) => { lines.push(line); };
  try { diagnostics.logVkOAuthFailure(error); } finally { console.warn = warn; }
  assert.equal(lines.length, 1);
  assert.equal(lines[0].includes(privateEcho), false);
  return JSON.parse(lines[0]);
}
async function communityFailure(fetchImpl: typeof fetch, communityId = '242095689'): Promise<unknown> {
  try { await validateVkCommunity({ token: privateEcho, communityId, fetchImpl }); }
  catch (error) { return error; }
  assert.fail('fixture must reject community validation');
}
const expected = (communityValidation: unknown) => ({ event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'COMMUNITY_VALIDATION', reason: 'FAILED', communityValidation });

for (const [vkErrorCode, connectorCode, errorType] of [
  [1051, 'VK_METHOD_PROFILE_DENIED', 'PERMANENT'], [15, 'VK_API_ACCESS_NOT_GRANTED', 'PERMANENT'],
  [27, 'VK_GROUP_TOKEN_METHOD_DENIED', 'PERMANENT'], [5, 'VK_5', 'AUTH'], [6, 'VK_6', 'TEMPORARY'],
  [100, 'VK_100', 'VALIDATION'], [9, 'VK_9', 'PERMANENT'],
] as const) test(`OAuth community rejection retains numeric VK ${vkErrorCode} without provider text`, async () => {
  const error = await communityFailure(async () => Response.json({ error: { error_code: vkErrorCode, error_msg: privateEcho, request_params: [{ key: 'access_token', value: privateEcho }] } }));
  const wrapped = mapFailure(error);
  assert.ok(wrapped instanceof VkOAuthError);
  assert.equal(wrapped.code, 'AUTH');
  assert.deepEqual(wrapped.diagnostic, { stage: 'COMMUNITY_VALIDATION', reason: 'FAILED' });
  assert.deepEqual(logged(wrapped), expected({ connectorCode, errorType, vkErrorCode }));
  assert.equal(JSON.stringify(wrapped).includes(privateEcho), false);
});

test('OAuth community transport failure retains only its network class', async () => {
  const error = await communityFailure(async () => { throw new Error(privateEcho, { cause: { code: 'ENOTFOUND', url: privateEcho } }); });
  assert.deepEqual(logged(mapFailure(error)), expected({ connectorCode: 'VK_UNAVAILABLE', errorType: 'TEMPORARY', networkErrorClass: 'DNS' }));
});

test('OAuth community shape and editor rejections remain denied with distinct closed codes', async () => {
  const malformed = await communityFailure(async () => Response.json({ response: { groups: [] } }));
  assert.deepEqual(logged(mapFailure(malformed)), expected({ connectorCode: 'VK_COMMUNITY', errorType: 'VALIDATION' }));
  const permission = await communityFailure(async () => Response.json({ response: { groups: [{ id: 242095689, type: 'page', is_admin: 0, admin_level: 1, name: privateEcho }] } }));
  assert.deepEqual(logged(mapFailure(permission)), expected({ connectorCode: 'VK_POST_PERMISSION', errorType: 'AUTH' }));
});

test('OAuth community mapper does not trust foreign errors with connector-looking properties', () => {
  const foreign = Object.assign(new Error(privateEcho), { code: 'VK_POST_PERMISSION', errorType: 'AUTH', vkDiagnostic: { stage: 'COMMUNITY_VALIDATION', vkErrorCode: 1051 }, communityValidationMetadata: { connectorCode: privateEcho } });
  assert.deepEqual(logged(mapFailure(foreign)), { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'COMMUNITY_VALIDATION', reason: 'FAILED' });
});

test('OAuth logger revalidates mutated community metadata and confines it to its stage', () => {
  const error = new VkOAuthError('AUTH', { stage: 'COMMUNITY_VALIDATION', reason: 'FAILED' });
  const attach = (metadata: unknown) => Object.assign(error, { communityValidationMetadata: metadata });
  attach({ connectorCode: 'VK_UNAVAILABLE', errorType: 'TEMPORARY', vkErrorCode: 1051, networkErrorClass: 'TLS', raw: privateEcho });
  assert.deepEqual(logged(error), expected({ connectorCode: 'VK_UNAVAILABLE', errorType: 'TEMPORARY', vkErrorCode: 1051, networkErrorClass: 'TLS' }));
  for (const metadata of [null, [], Array(2), { connectorCode: privateEcho, errorType: 'AUTH' }, { connectorCode: 'VK_COMMUNITY', errorType: privateEcho }]) {
    attach(metadata);
    assert.deepEqual(logged(error), { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'COMMUNITY_VALIDATION', reason: 'FAILED' });
  }
  for (const vkErrorCode of [0, -1, 10000, 1.5, NaN, Infinity, '1051', privateEcho]) {
    attach({ connectorCode: 'VK_COMMUNITY', errorType: 'VALIDATION', vkErrorCode, networkErrorClass: privateEcho });
    assert.deepEqual(logged(error), expected({ connectorCode: 'VK_COMMUNITY', errorType: 'VALIDATION' }));
  }
  attach({ connectorCode: 'VK_COMMUNITY', errorType: 'VALIDATION', vkErrorCode: 1 });
  Object.assign(error, { diagnostic: { stage: 'GRANT_VALIDATION', reason: 'FAILED' } });
  assert.deepEqual(logged(error), { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'GRANT_VALIDATION', reason: 'FAILED' });
});

test('OAuth mapper discards cross-stage diagnostic fields and snapshots mutable connector properties', () => {
  const error = new VkCommunityValidationError({ ok: false, code: 'VK_COMMUNITY', errorType: 'VALIDATION', message: privateEcho, vkDiagnostic: { stage: 'WALL_POST', method: 'wall.post', vkErrorCode: 1051 } });
  assert.deepEqual(logged(mapFailure(error)), expected({ connectorCode: 'VK_COMMUNITY', errorType: 'VALIDATION' }));
  let reads = 0;
  Object.defineProperty(error, 'code', { get() { return reads++ === 0 ? 'VK_COMMUNITY' : privateEcho; } });
  assert.deepEqual(logged(mapFailure(error)), expected({ connectorCode: 'VK_COMMUNITY', errorType: 'VALIDATION' }));
  assert.equal(reads, 1);
});

test('OAuth logger snapshots mutable stage and metadata fields once', () => {
  const error = new VkOAuthError('AUTH');
  let stageReads = 0, networkReads = 0;
  Object.assign(error, { diagnostic: { get stage() { return stageReads++ === 0 ? 'COMMUNITY_VALIDATION' : privateEcho; }, reason: 'FAILED' }, communityValidationMetadata: { connectorCode: 'VK_UNAVAILABLE', errorType: 'TEMPORARY', get networkErrorClass() { return networkReads++ === 0 ? 'DNS' : privateEcho; } } });
  assert.deepEqual(logged(error), expected({ connectorCode: 'VK_UNAVAILABLE', errorType: 'TEMPORARY', networkErrorClass: 'DNS' }));
  assert.equal(stageReads, 1); assert.equal(networkReads, 1);
});

test('OAuth logger and mapper fail closed on throwing getters', () => {
  const community = new VkCommunityValidationError({ ok: false, code: 'VK_COMMUNITY', errorType: 'VALIDATION', message: privateEcho });
  Object.defineProperty(community, 'code', { get() { throw new Error(privateEcho); } });
  assert.deepEqual(logged(mapFailure(community)), { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'COMMUNITY_VALIDATION', reason: 'FAILED' });
  const error = new VkOAuthError('AUTH');
  Object.defineProperty(error, 'communityValidationMetadata', { get() { throw new Error(privateEcho); } });
  assert.doesNotThrow(() => logged(error));
});
