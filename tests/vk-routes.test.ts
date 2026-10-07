import test from 'node:test';
import assert from 'node:assert/strict';

test('VK disconnect origin validation remains available with missing or corrupt OAuth setup', async () => {
  const path = '../lib/server/vk/http.ts';
  const { requireVkSameOrigin } = await import(path);
  const previous = process.env.VK_REDIRECT_URI;
  process.env.VK_REDIRECT_URI = 'invalid';
  try {
    assert.doesNotThrow(() => requireVkSameOrigin(new Request('https://planly.test/api/social-accounts/vk/disconnect', { headers: { origin: 'https://planly.test' } })));
    assert.throws(() => requireVkSameOrigin(new Request('https://planly.test/api/social-accounts/vk/disconnect', { headers: { origin: 'https://other.test' } })));
  } finally {
    if (previous === undefined) delete process.env.VK_REDIRECT_URI; else process.env.VK_REDIRECT_URI = previous;
  }
});

for (const [path, method] of [['start', 'POST'], ['callback', 'GET'], ['disconnect', 'POST']] as const) {
  test(`VK ${path} authenticates before malformed input or provider transport`, async () => {
    const modulePath = `../app/api/social-accounts/vk/${path}/route.ts`;
    const route = await import(modulePath).catch(() => null);
    assert.ok(route, 'Owner-authenticated VK route must exist');
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('Unexpected provider call'); };
    try {
      const response = await route[method](new Request(`https://planly.test/api/social-accounts/vk/${path}`, {
        method, ...(method === 'POST' ? { body: '{bad' } : {}),
      }));
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'Unauthorized' });
      assert.equal(calls, 0);
    } finally { globalThis.fetch = original; }
  });
}
