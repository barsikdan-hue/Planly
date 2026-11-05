import test from 'node:test';
import assert from 'node:assert/strict';
import { createVkConnector } from '../lib/server/connectors/vk.ts';
import * as vkModule from '../lib/server/connectors/vk.ts';
import type { PublishInput, PublishResult } from '../lib/server/connectors/types.ts';

const secret = 'fixture-access-secret';
const signed = 'fixture-upload-signature';
const primary = `https://pu.vk.ru/upload?sig=${signed}`;
const fallback = `https://pu2.vk.com/upload?sig=${signed}`;
const input: PublishInput = { publicationId: 'audit-publication', socialAccountId: 'audit-account', provider: 'VK', destinationId: '-123', text: 'Фото', media: [{ name: 'photo.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }] };
const api = (response: unknown) => Response.json({ response });
const receipt = { id: 44, owner_id: -123 };
type FixtureOptions = {
  server?: Record<string, unknown>; saved?: unknown;
  reply?: (stage: string, url: URL, init: RequestInit) => Response | Promise<Response> | undefined;
};
function fixture(options: FixtureOptions = {}) {
  const requests: string[] = [];
  const connector = createVkConnector({ getAccessToken: async () => secret, fetchImpl: async (url, init) => {
    const target = new URL(String(url));
    const stage = target.hostname === 'api.vk.com' ? target.pathname.split('/').at(-1)! : target.hostname;
    requests.push(stage);
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    if (target.hostname !== 'api.vk.com') {
      assert.ok(init?.body instanceof FormData);
      assert.equal(init.body.get('access_token'), null);
      assert.equal(new Headers(init.headers).get('authorization'), null);
    }
    const override = await options.reply?.(stage, target, init!);
    if (override) return override;
    if (stage === 'photos.getWallUploadServer') return api({ album_id: -14, user_id: 88, group_id: 123, upload_url: primary, ...options.server });
    if (target.hostname !== 'api.vk.com') return Response.json({ server: 17, photo: 'opaque-photo', hash: 'opaque-hash' });
    if (stage === 'photos.saveWallPhoto') return api(options.saved ?? [receipt]);
    assert.equal(stage, 'wall.post');
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('owner_id'), '-123');
    assert.equal(body.get('attachments'), `photo${(options.saved as typeof receipt[] | undefined)?.[0]?.owner_id ?? -123}_44`);
    return api({ post_id: 51 });
  } });
  return { connector, requests };
}
function failure(result: PublishResult) {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('Expected failure');
  const serialized = JSON.stringify(result);
  for (const value of [secret, signed, primary, fallback, 'hostile-provider-body']) assert.ok(!serialized.includes(value), `Unsafe diagnostic: ${value}`);
  return result;
}

for (const method of ['photos.getWallUploadServer', 'photos.saveWallPhoto', 'wall.post']) {
  for (const [providerCode, code] of [[1051, 'VK_METHOD_PROFILE_DENIED'], [27, 'VK_GROUP_TOKEN_METHOD_DENIED'], [15, 'VK_API_ACCESS_NOT_GRANTED']] as const) {
    test(`VK ${method} explicit ${providerCode} is a stable permanent rejection without retry or provider echo`, async () => {
      const { connector, requests } = fixture({ reply: stage => stage === method ? Response.json({ error: { error_code: providerCode, error_msg: `hostile-provider-body ${secret}`, request_params: [{ value: primary }] } }) : undefined });
      const result = failure(await connector.publish(input));
      assert.equal(result.code, code);
      assert.equal(result.errorType, 'PERMANENT');
      assert.equal(result.retryAfterMs, undefined);
      assert.equal(result.vkDiagnostic?.method, method);
      assert.equal(result.vkDiagnostic?.vkErrorCode, providerCode);
      assert.equal(requests.at(-1), method);
      assert.equal(requests.filter(stage => stage === method).length, 1);
    });
  }
}

test('VK photo saved under authenticated positive upload user keeps actual attachment owner and negative wall owner', async () => {
  const { connector, requests } = fixture({ saved: [{ id: 44, owner_id: 88 }] });
  assert.deepEqual(await connector.publish(input), { ok: true, remoteId: '-123_51', remoteUrl: 'https://vk.com/wall-123_51' });
  assert.deepEqual(requests, ['photos.getWallUploadServer', 'pu.vk.ru', 'photos.saveWallPhoto', 'wall.post']);
});
for (const owner of [0, 89, -999, '88', 88.5, Number.MAX_SAFE_INTEGER + 1, null]) {
  test(`VK refuses untrusted photo owner ${owner} before wall mutation`, async () => {
    const { connector, requests } = fixture({ saved: [{ id: 44, owner_id: owner }] });
    assert.equal(failure(await connector.publish(input)).code, 'VK_PHOTO_RECEIPT');
    assert.ok(!requests.includes('wall.post'));
  });
}
test('VK positive-owner private receipt is refused before wall mutation', async () => {
  const { connector, requests } = fixture({ saved: [{ id: 44, owner_id: 88, access_key: secret }] });
  assert.equal(failure(await connector.publish(input)).code, 'VK_PHOTO_RECEIPT');
  assert.ok(!requests.includes('wall.post'));
});

test('VK upload HTTP405 returns exact stage/status/host class without signed URL or payload', async () => {
  const { connector, requests } = fixture({ reply: stage => stage === 'pu.vk.ru' ? new Response(`hostile-provider-body ${secret}`, { status: 405, headers: { allow: `hostile-provider-body ${primary}` } }) : undefined });
  const result = failure(await connector.publish(input));
  assert.equal(result.code, 'VK_UPLOAD_HTTP_405');
  assert.equal(result.errorType, 'PERMANENT');
  assert.deepEqual(result.vkDiagnostic, { stage: 'UPLOAD', uploadHttpStatus: 405, uploadHostClass: 'VK_RU_PHOTO_UPLOAD', uploadAttempt: 'PRIMARY' });
  assert.deepEqual(requests, ['photos.getWallUploadServer', 'pu.vk.ru']);
});
test('VK fallback upload is used once after explicit primary HTTP405 and never reuses OAuth in multipart', async () => {
  const { connector, requests } = fixture({ server: { fallback_upload_url: fallback }, reply: stage => stage === 'pu.vk.ru' ? new Response(null, { status: 405 }) : undefined });
  assert.equal((await connector.publish(input)).ok, true);
  assert.deepEqual(requests, ['photos.getWallUploadServer', 'pu.vk.ru', 'pu2.vk.com', 'photos.saveWallPhoto', 'wall.post']);
});
test('VK both upload endpoints HTTP405 exhaust a single fallback budget and preserve final safe diagnosis', async () => {
  const { connector, requests } = fixture({ server: { fallback_upload_url: fallback }, reply: stage => stage === 'pu.vk.ru' || stage === 'pu2.vk.com' ? new Response(null, { status: 405 }) : undefined });
  const result = failure(await connector.publish(input));
  assert.equal(result.code, 'VK_UPLOAD_HTTP_405');
  assert.equal(result.vkDiagnostic?.uploadAttempt, 'FALLBACK');
  assert.equal(result.vkDiagnostic?.uploadHostClass, 'VK_COM_PHOTO_UPLOAD');
  assert.deepEqual(requests, ['photos.getWallUploadServer', 'pu.vk.ru', 'pu2.vk.com']);
});
for (const badFallback of ['http://pu2.vk.com/upload', 'https://localhost/upload', 'https://pu2.vk.com.evil.invalid/upload', 'https://pu2.vk.com:8443/upload', `https://pu2.vk.com/upload?access_token=${secret}`, `https://pu2.vk.com/upload?sig=${secret}`, primary]) {
  test('VK unsafe or duplicate fallback receives no private bytes after HTTP405', async () => {
    const { connector, requests } = fixture({ server: { fallback_upload_url: badFallback }, reply: stage => stage === 'pu.vk.ru' ? new Response(null, { status: 405 }) : undefined });
    const result = failure(await connector.publish(input));
    assert.equal(result.code, 'VK_UPLOAD_HTTP_405');
    assert.deepEqual(requests, ['photos.getWallUploadServer', 'pu.vk.ru']);
  });
}
for (const mode of ['timeout', 'connection', 'redirect', 'malformed', 'empty-photo', 'http403', 'http500']) {
  test(`VK ${mode} does not fall back after an unknown or ineligible primary outcome`, async () => {
    const { connector, requests } = fixture({ server: { fallback_upload_url: fallback }, reply: stage => {
      if (stage !== 'pu.vk.ru') return;
      if (mode === 'timeout') throw new DOMException(`hostile-provider-body ${primary}`, 'TimeoutError');
      if (mode === 'connection') throw new Error(`hostile-provider-body ${primary}`);
      if (mode === 'redirect') return new Response(null, { status: 302, headers: { location: fallback } });
      if (mode === 'malformed') return new Response(`hostile-provider-body ${secret}`);
      if (mode === 'empty-photo') return Response.json({ server: 17, photo: '', hash: 'opaque-hash' });
      return new Response(null, { status: mode === 'http403' ? 403 : 500 });
    } });
    const result = failure(await connector.publish(input));
    if (mode === 'timeout') assert.equal(result.vkDiagnostic?.networkErrorClass, 'TIMEOUT');
    assert.deepEqual(requests, ['photos.getWallUploadServer', 'pu.vk.ru']);
  });
}

test('VK diagnostic sanitizer reconstructs only closed values and drops secret-bearing nested/extra fields', () => {
  const sanitize = (vkModule as Record<string, unknown>).sanitizeVkPublicationDiagnostic as (value: unknown) => unknown;
  assert.equal(typeof sanitize, 'function');
  const supplied = { stage: 'UPLOAD', uploadHttpStatus: 405, uploadHostClass: 'VK_RU_PHOTO_UPLOAD', uploadAttempt: 'PRIMARY', url: primary, error: { message: secret }, method: primary, vkErrorCode: secret, networkErrorClass: signed };
  assert.deepEqual(sanitize(supplied), { stage: 'UPLOAD', uploadHttpStatus: 405, uploadHostClass: 'VK_RU_PHOTO_UPLOAD', uploadAttempt: 'PRIMARY' });
  assert.deepEqual(sanitize({ stage: 'WALL_POST', method: 'wall.post', vkErrorCode: 1051, networkErrorClass: 'TIMEOUT' }), { stage: 'WALL_POST', method: 'wall.post', vkErrorCode: 1051, networkErrorClass: 'TIMEOUT' });
  for (const value of [null, [], { stage: secret }, { stage: { toString: () => 'UPLOAD', secret } }]) assert.equal(sanitize(value), undefined);
  for (const value of [0, -1, 10000, 1.5, '1051']) assert.deepEqual(sanitize({ stage: 'WALL_POST', vkErrorCode: value }), { stage: 'WALL_POST' });
  for (const value of [0, 99, 600, 405.5, '405']) assert.deepEqual(sanitize({ stage: 'UPLOAD', uploadHttpStatus: value }), { stage: 'UPLOAD' });
  const forgedMethod = { toString: () => 'wall.post', secret };
  assert.deepEqual(sanitize({ stage: 'WALL_POST', method: forgedMethod }), { stage: 'WALL_POST' });
  let reads = 0;
  const changingStage = { get stage() { return ++reads <= 2 ? 'UPLOAD' : secret; } };
  assert.deepEqual(sanitize(changingStage), { stage: 'UPLOAD' });
  assert.equal(sanitize({ get stage() { throw new Error(secret); } }), undefined);
});

for (const [errorCode, category] of [['ENOTFOUND', 'DNS'], ['ECONNRESET', 'CONNECTION'], ['ERR_TLS_CERT_ALTNAME_INVALID', 'TLS'], [secret, 'OTHER']] as const) {
  test(`VK upload transport categorizes ${category} without echoing error code/message`, async () => {
    const { connector, requests } = fixture({ server: { fallback_upload_url: fallback }, reply: stage => {
      if (stage === 'pu.vk.ru') throw new Error(`hostile-provider-body ${primary}`, { cause: { code: errorCode, secret } });
      return undefined;
    } });
    const result = failure(await connector.publish(input));
    assert.equal(result.vkDiagnostic?.networkErrorClass, category);
    assert.deepEqual(requests, ['photos.getWallUploadServer', 'pu.vk.ru']);
  });
}
