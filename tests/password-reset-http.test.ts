import test from 'node:test';
import assert from 'node:assert/strict';
const path = '../lib/server/auth/password-reset-http.ts';
const http = await import(path).catch(() => null);
const request = () => new Request('http://planly.test/api/auth/password-reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'x'.repeat(43), password: 'synthetic-new-password' }) });
test('IP and token budgets reject before password hashing/consumption with Retry-After', async () => {
  assert.ok(http?.createPasswordResetHandler);
  for (const denied of ['ip', 'token']) {
    let consumed = 0, tokenChecks = 0;
    const handle = http.createPasswordResetHandler({
      ipBudget: async () => ({ allowed: denied !== 'ip', retryAfterSeconds: 37 }),
      tokenBudget: async () => { tokenChecks++; return { allowed: false, retryAfterSeconds: 41 }; },
      consume: async () => { consumed++; return { ok: true }; },
    });
    const response = await handle(request());
    assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), denied === 'ip' ? '37' : '41');
    assert.equal(consumed, 0); assert.equal(tokenChecks, denied === 'ip' ? 0 : 1);
  }
});
