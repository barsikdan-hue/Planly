import test from 'node:test';
import assert from 'node:assert/strict';
import { hashOwnerPassword, verifyOwnerPassword } from '../lib/server/auth/password.ts';

test('scrypt password hashes verify only the original password', async () => {
  const encoded = await hashOwnerPassword('correct horse battery staple');
  assert.equal(encoded.startsWith('scrypt$1$'), true);
  assert.equal(await verifyOwnerPassword('correct horse battery staple', encoded), true);
  assert.equal(await verifyOwnerPassword('wrong password', encoded), false);
});

test('malformed or unsupported password hashes are rejected safely', async () => {
  assert.equal(await verifyOwnerPassword('anything', 'not-a-hash'), false);
  assert.equal(await verifyOwnerPassword('anything', 'scrypt$99$broken'), false);
});
