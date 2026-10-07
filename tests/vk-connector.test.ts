import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createVkConnector, validateVkCommunity } from '../lib/server/connectors/vk.ts';
import type { PublishInput, PublishResult } from '../lib/server/connectors/types.ts';

const token = randomBytes(32).toString('base64url');
const input: PublishInput = { publicationId: 'publication-1', socialAccountId: 'vk-account-1', provider: 'VK', destinationId: '-123', text: 'Привет <мир> & 😜' };
type RequestLog = { url: URL; init: RequestInit; body: URLSearchParams | FormData };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const api = (value: unknown) => json({ response: value });
const photo = (mimeType = 'image/png', bytes = [1, 2, 3]) => ({ name: 'untrusted-name', mimeType, bytes: new Uint8Array(bytes) });
function fixture(reply: (request: RequestLog, index: number) => Response | Promise<Response> = () => api({ post_id: 42 })) {
  const requests: RequestLog[] = [];
  const accounts: string[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    const target = new URL(String(url));
    // Generated fixture credentials must never occur in a URL, including upload query strings.
    assert.ok(!target.toString().includes(token), 'transport credential appeared in URL');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal instanceof AbortSignal);
    const body = init!.body instanceof FormData ? init!.body : new URLSearchParams(String(init!.body));
    if (target.hostname === 'api.vk.com') {
      assert.ok(body instanceof URLSearchParams);
      assert.ok(body.get('access_token') === token, 'API token missing from request body');
      assert.equal(body.get('v'), '5.199');
      assert.equal(new Headers(init!.headers).get('content-type'), 'application/x-www-form-urlencoded');
    } else {
      assert.ok(body instanceof FormData);
      assert.equal(body.get('access_token'), null);
      assert.equal(new Headers(init!.headers).get('authorization'), null);
    }
    const request = { url: target, init: init!, body };
    requests.push(request);
    return reply(request, requests.length - 1);
  };
  const connector = createVkConnector({ getAccessToken: async id => { accounts.push(id); return token; }, fetchImpl });
  return { connector, fetchImpl, requests, accounts };
}
function failed(result: PublishResult, type: string, code?: string) {
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorType, type);
  if (code) assert.equal(result.code, code);
  assert.ok(!JSON.stringify(result).includes(token), 'diagnostic leaked generated credential');
}

test('VK text sends once with account credentials and owner-scoped receipt', async () => {
  const { connector, requests, accounts } = fixture();
  assert.deepEqual(await connector.publish(input), { ok: true, remoteId: '-123_42', remoteUrl: 'https://vk.com/wall-123_42' });
  assert.deepEqual(accounts, ['vk-account-1']);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.toString(), 'https://api.vk.com/method/wall.post');
  const body = requests[0].body as URLSearchParams;
  assert.equal(body.get('owner_id'), '-123');
  assert.equal(body.get('from_group'), '1');
  assert.equal(body.get('message'), input.text);
  assert.equal(body.get('guid'), 'publication-1');
});

test('VK ordered private PNG and JPEG bytes upload as photo then save before text+attachments wall post', async () => {
  let uploads = 0;
  let saves = 0;
  const { connector, requests } = fixture(request => {
    const body = request.body;
    if (request.url.pathname.endsWith('photos.getWallUploadServer')) {
      assert.equal((body as URLSearchParams).get('group_id'), '123');
      return api({ album_id: -14, user_id: 88, group_id: 123, upload_url: 'https://pu.vk.com/c123/upload.php?act=do_add' });
    }
    if (request.url.hostname === 'pu.vk.com') {
      uploads++;
      return json({ server: 17, photo: `opaque-photo-${uploads}`, hash: `safe-hash-${uploads}` });
    }
    if (request.url.pathname.endsWith('photos.saveWallPhoto')) {
      saves++;
      assert.equal((body as URLSearchParams).get('group_id'), '123');
      assert.equal((body as URLSearchParams).get('server'), '17');
      assert.equal((body as URLSearchParams).get('photo'), `opaque-photo-${saves}`);
      assert.equal((body as URLSearchParams).get('hash'), `safe-hash-${saves}`);
      return api([{ id: saves + 9, owner_id: -123, album_id: -14, date: 1234 }]);
    }
    assert.equal((body as URLSearchParams).get('attachments'), 'photo-123_10,photo-123_11');
    assert.equal((body as URLSearchParams).get('message'), input.text);
    return api({ post_id: 42 });
  });
  assert.equal((await connector.publish({ ...input, media: [photo(), photo('image/jpeg', [4, 5])] })).ok, true);
  assert.deepEqual(requests.map(r => r.url.hostname === 'api.vk.com' ? r.url.pathname.split('/').at(-1) : 'upload'), [
    'photos.getWallUploadServer', 'upload', 'photos.saveWallPhoto', 'photos.getWallUploadServer', 'upload', 'photos.saveWallPhoto', 'wall.post',
  ]);
  for (const [index, bytes, mime, name] of [[1, [1, 2, 3], 'image/png', 'photo.png'], [4, [4, 5], 'image/jpeg', 'photo.jpg']] as const) {
    const form = requests[index].body as FormData;
    assert.deepEqual([...form.keys()], ['photo']);
    const file = form.get('photo') as File;
    assert.equal(file.name, name);
    assert.equal(file.type, mime);
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], bytes);
  }
});

for (const changed of [{ socialAccountId: undefined }, { socialAccountId: '' }, { destinationId: '123' }, { destinationId: '-0123' }, { provider: 'MAX' }]) {
  test(`VK rejects invalid account/destination/provider ${JSON.stringify(changed)} without provider transport`, async () => {
    const { connector, requests, accounts } = fixture();
    failed(await connector.publish({ ...input, ...changed } as PublishInput), 'VALIDATION');
    assert.equal(requests.length, 0);
    assert.equal(accounts.length, 0);
  });
}
test('VK video is unsupported before credential lookup or private-byte upload', async () => {
  const { connector, requests, accounts } = fixture();
  failed(await connector.publish({ ...input, media: [photo('video/mp4')] }), 'VALIDATION');
  assert.equal(requests.length, 0);
  assert.equal(accounts.length, 0);
});
test('VK account credential failure is sanitized and does not publish', async () => {
  let sends = 0;
  const connector = createVkConnector({ getAccessToken: async () => { throw new Error(`account mismatch ${token}`); }, fetchImpl: async () => { sends++; return api({ post_id: 1 }); } });
  failed(await connector.publish(input), 'AUTH', 'VK_RECONNECT_REQUIRED');
  assert.equal(sends, 0);
});

for (const [code, type] of [[5, 'AUTH'], [1117, 'AUTH'], [6, 'TEMPORARY'], [29, 'TEMPORARY'], [7, 'AUTH'], [15, 'AUTH'], [20, 'AUTH'], [14, 'AUTH'], [17, 'AUTH'], [24, 'AUTH'], [25, 'AUTH'], [704, 'AUTH'], [100, 'VALIDATION'], [214, 'AUTH'], [222, 'VALIDATION'], [9, 'PERMANENT']] as const) {
  test(`VK explicit error ${code} has bounded ${type} classification with no provider echo`, async () => {
    const { connector, requests } = fixture(() => json({ error: { error_code: code, error_msg: token, request_params: [{ key: 'access_token', value: token }] } }));
    const result = await connector.publish(input);
    failed(result, type, `VK_${code}`);
    assert.equal(requests.length, 1);
    if (!result.ok && type === 'TEMPORARY') assert.ok(result.retryAfterMs && result.retryAfterMs > 0 && result.retryAfterMs <= 86400000);
  });
}
for (const payload of [{ response: {} }, { response: { post_id: 0 } }, { response: { post_id: '42' } }, { error: { error_code: 1 } }, { error: { error_code: 10 } }, { error: { error_code: token } }, {}]) {
  test('VK unknown or malformed wall receipt is permanent ambiguous with no resend', async () => {
    const { connector, requests } = fixture(() => json(payload));
    failed(await connector.publish(input), 'PERMANENT', 'AMBIGUOUS_DELIVERY');
    assert.equal(requests.length, 1);
  });
}
test('VK wall transport timeout and parse error cannot leak provider URL/token or become retryable', async () => {
  for (const mode of ['throw', 'parse', 'gateway']) {
    const { connector, requests } = fixture(() => {
      if (mode === 'throw') throw new Error(`timeout https://host.invalid/?access_token=${token}`);
      if (mode === 'parse') return new Response(`malformed ${token}`);
      return json({}, 503);
    });
    failed(await connector.publish(input), 'PERMANENT', 'AMBIGUOUS_DELIVERY');
    assert.equal(requests.length, 1);
  }
});

for (const uploadUrl of ['http://pu.vk.com/upload', 'https://pu.vk.com.evil.invalid/upload', 'https://evil.invalid/upload', 'https://127.0.0.1/upload', 'https://[::1]/upload', 'https://vk.com/upload', 'https://pu.vk.com:8443/upload', 'https://user:pass@pu.vk.com/upload', 'https://pu.vk.com/upload#fragment', `https://pu.vk.com/upload?access_token=${token}`, `https://pu.vk.com/upload?opaque=${token}`]) {
  test('VK hostile upload destination rejects before forwarding private bytes or credentials', async () => {
    const { connector, requests } = fixture(() => api({ album_id: -14, user_id: 88, group_id: 123, upload_url: uploadUrl }));
    failed(await connector.publish({ ...input, media: [photo()] }), 'PERMANENT', 'VK_UPLOAD_URL');
    assert.equal(requests.length, 1);
  });
}
test('VK upload redirect is terminal without save or wall post', async () => {
  const { connector, requests } = fixture(request => request.url.hostname === 'api.vk.com'
    ? api({ album_id: -14, user_id: 88, group_id: 123, upload_url: 'https://pu.vk.com/upload' })
    : new Response(null, { status: 302, headers: { location: `https://evil.invalid/${token}` } }));
  failed(await connector.publish({ ...input, media: [photo()] }), 'PERMANENT', 'VK_UPLOAD_REDIRECT');
  assert.equal(requests.length, 2);
});
for (const server of [
  { album_id: -14, group_id: 123 },
  { user_id: 88, group_id: 123 },
  { album_id: -14, user_id: 88, group_id: '123' },
  { album_id: -14, user_id: 88, group_id: 999 },
]) {
  test('VK incomplete or conflicting upload-server identity never receives private bytes', async () => {
    const { connector, requests } = fixture(() => api({ ...server, upload_url: 'https://pu.vk.com/upload' }));
    failed(await connector.publish({ ...input, media: [photo()] }), 'PERMANENT', 'VK_UPLOAD_RESPONSE');
    assert.equal(requests.length, 1);
  });
}
test('VK wall receipt with a conflicting explicit owner is ambiguous', async () => {
  const { connector, requests } = fixture(() => api({ post_id: 42, owner_id: -999 }));
  failed(await connector.publish(input), 'PERMANENT', 'AMBIGUOUS_DELIVERY');
  assert.equal(requests.length, 1);
});
for (const receipt of [{}, { server: 1, photo: '', hash: 'hash' }, { server: 1, photo: '[]', hash: 'hash' }, { server: '1', photo: 'opaque', hash: 'hash' }]) {
  test('VK malformed upload receipt cannot proceed to save or wall mutation', async () => {
    const { connector, requests } = fixture(request => request.url.hostname === 'api.vk.com'
      ? api({ album_id: -14, user_id: 88, group_id: 123, upload_url: 'https://pu.vk.com/upload' }) : json(receipt));
    failed(await connector.publish({ ...input, media: [photo()] }), 'TEMPORARY', 'VK_UPLOAD_RESPONSE');
    assert.equal(requests.length, 2);
  });
}
for (const saved of [[], [{ id: 1, owner_id: -999 }], [{ id: 0, owner_id: -123 }], [{ id: 1, owner_id: -123, access_key: token }], [{ id: 1, owner_id: -123 }, { id: 2, owner_id: -123 }]]) {
  test('VK missing, nonmatching or unsafe photo save receipt never causes wall publication', async () => {
    const { connector, requests } = fixture(request => {
      if (request.url.hostname !== 'api.vk.com') return json({ server: 1, photo: 'opaque', hash: 'hash' });
      if (request.url.pathname.endsWith('photos.saveWallPhoto')) return api(saved);
      return api({ album_id: -14, user_id: 88, group_id: 123, upload_url: 'https://pu.vk.com/upload' });
    });
    failed(await connector.publish({ ...input, media: [photo()] }), 'PERMANENT', 'VK_PHOTO_RECEIPT');
    assert.equal(requests.length, 3);
  });
}
for (const mode of ['transport', 'parse', 'gateway', 'unknown', 'internal'] as const) {
  test(`VK unknown photo save ${mode} is terminal without wall publication or provider diagnostic leakage`, async () => {
    const { connector, requests } = fixture(request => {
      if (request.url.hostname !== 'api.vk.com') return json({ server: 1, photo: 'opaque', hash: 'hash' });
      if (request.url.pathname.endsWith('photos.saveWallPhoto')) {
        if (mode === 'transport') throw new Error(`lost photo confirmation ${token}`);
        if (mode === 'parse') return new Response(`malformed ${token}`);
        if (mode === 'gateway') return json({}, 503);
        return json({ error: { error_code: mode === 'unknown' ? 1 : 10, error_msg: token, request_params: [token] } });
      }
      return api({ album_id: -14, user_id: 88, group_id: 123, upload_url: 'https://pu.vk.com/upload' });
    });
    failed(await connector.publish({ ...input, media: [photo()] }), 'PERMANENT', 'VK_PHOTO_SAVE_AMBIGUOUS');
    assert.equal(requests.length, 3);
    assert.ok(requests.every(request => !request.url.pathname.endsWith('wall.post')));
  });
}
for (const code of [6, 29]) {
  test(`VK explicit photo save rate rejection ${code} remains eligible for bounded retry`, async () => {
    const { connector, requests } = fixture(request => {
      if (request.url.hostname !== 'api.vk.com') return json({ server: 1, photo: 'opaque', hash: 'hash' });
      if (request.url.pathname.endsWith('photos.saveWallPhoto')) return json({ error: { error_code: code, error_msg: token } });
      return api({ album_id: -14, user_id: 88, group_id: 123, upload_url: 'https://pu.vk.com/upload' });
    });
    const result = await connector.publish({ ...input, media: [photo()] });
    failed(result, 'TEMPORARY', `VK_${code}`);
    assert.ok(!result.ok && result.retryAfterMs && result.retryAfterMs <= 86400000);
    assert.equal(requests.length, 3);
  });
}

const community = { id: 123, name: 'Fixture community', type: 'group', is_closed: 0, is_admin: 1, admin_level: 3 };
for (const level of [2, 3]) {
  test(`VK community validator confirms matching editor/admin level ${level} through API5.199`, async () => {
    const { fetchImpl, requests } = fixture(() => api({ groups: [{ ...community, admin_level: level }], profiles: [] }));
    assert.deepEqual(await validateVkCommunity({ token, communityId: '123', fetchImpl }), { destinationId: '-123', displayName: 'Fixture community' });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url.pathname, '/method/groups.getById');
    assert.equal((requests[0].body as URLSearchParams).get('group_ids'), '123');
  });
}
for (const rejected of [{ ...community, id: 999 }, { ...community, is_admin: 0 }, { ...community, admin_level: 1 }, { ...community, admin_level: undefined }, { ...community, deactivated: 'banned' }]) {
  test('VK community validator rejects mismatched ID, insufficient or deactivated community authority', async () => {
    const { fetchImpl } = fixture(() => api({ groups: [rejected], profiles: [] }));
    await assert.rejects(validateVkCommunity({ token, communityId: '123', fetchImpl }), error => {
      assert.ok(error instanceof Error);
      assert.ok(!JSON.stringify(error).includes(token));
      assert.ok(!error.message.includes(token));
      return true;
    });
  });
}
test('VK validation errors and malformed provider response expose only stable sanitized codes', async () => {
  for (const payload of [{ error: { error_code: 5, error_msg: token, request_params: [token] } }, { response: [community] }, { response: { groups: [] } }]) {
    const { fetchImpl } = fixture(() => json(payload));
    await assert.rejects(validateVkCommunity({ token, communityId: '123', fetchImpl }), error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(token));
      assert.ok(!JSON.stringify(error).includes(token));
      assert.equal(typeof (error as Error & { code: string }).code, 'string');
      return true;
    });
  }
});
