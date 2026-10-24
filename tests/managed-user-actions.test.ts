import test from 'node:test';
import assert from 'node:assert/strict';
const path = '../lib/server/auth/user-management.ts';
const service = await import(path);
test('manual access changes and reset are explicit strict actions', () => {
  assert.ok(service.managedUserActionSchema, 'lifecycle action contract must exist');
  for (const action of ['block', 'restore', 'unlimited', 'reset-password']) assert.equal(service.managedUserActionSchema.safeParse({ action }).success, true);
  assert.equal(service.managedUserActionSchema.safeParse({ action: 'expire', expiresAt: '2030-01-02T07:00:00Z' }).success, true);
  assert.equal(service.managedUserActionSchema.safeParse({ action: 'expire', expiresAt: 'invalid' }).success, false);
  assert.equal(service.managedUserActionSchema.safeParse({ action: 'restore', role: 'ADMIN' }).success, false);
});
test('deletion requires confirmation bound to an email, not a bare action', () => {
  assert.ok(service.managedUserActionSchema);
  assert.equal(service.managedUserActionSchema.safeParse({ action: 'delete' }).success, false);
  assert.equal(service.managedUserActionSchema.safeParse({ action: 'delete', confirmedEmail: 'agent@example.test' }).success, true);
});
