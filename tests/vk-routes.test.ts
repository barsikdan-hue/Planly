import test from 'node:test';
import assert from 'node:assert/strict';

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
