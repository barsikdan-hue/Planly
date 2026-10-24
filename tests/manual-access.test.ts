import test from 'node:test';
import assert from 'node:assert/strict';
const path = '../lib/manual-access.ts';
const policy = await import(path).catch(() => null);
const now = new Date('2030-01-01T07:00:00.000Z');
test('manual access has an exclusive deadline and null means unlimited', () => {
  assert.ok(policy?.hasManualAccess);
  assert.equal(policy.hasManualAccess({ role: 'USER', accessExpiresAt: null }, now), true);
  assert.equal(policy.hasManualAccess({ role: 'USER', accessExpiresAt: new Date(now.getTime() + 1) }, now), true);
  assert.equal(policy.hasManualAccess({ role: 'USER', accessExpiresAt: now }, now), false);
  assert.equal(policy.hasManualAccess({ role: 'USER', accessExpiresAt: new Date(now.getTime() - 1) }, now), false);
});
test('ADMIN remains administrable and malformed deadlines fail closed', () => {
  assert.ok(policy?.hasManualAccess);
  assert.equal(policy.hasManualAccess({ role: 'ADMIN', accessExpiresAt: new Date(0) }, now), true);
  assert.equal(policy.hasManualAccess({ role: 'USER', accessExpiresAt: new Date('invalid') }, now), false);
});
