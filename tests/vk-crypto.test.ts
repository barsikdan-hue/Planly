import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

type Envelope = { ciphertext: string; iv: string; tag: string; keyVersion: string };
type Context = { accountId: string; provider: string; purpose: string };
type CryptoConfig = { encryptionKey: string; keyVersion: string };
type CryptoModule = {
  sealVkPayload: (payload: unknown, context: Context, config: CryptoConfig) => Envelope;
  openVkPayload: (envelope: Envelope, context: Context, config: CryptoConfig) => unknown;
};
async function cryptoModule(): Promise<CryptoModule> {
  const path = '../lib/server/vk/crypto.ts';
  const loaded = await import(path).catch(() => null);
  assert.ok(loaded?.sealVkPayload && loaded?.openVkPayload, 'VK authenticated encryption feature is missing');
  return loaded;
}
const context = { accountId: 'crypto-account', provider: 'VK', purpose: 'CREDENTIALS' };
const config = () => ({ encryptionKey: randomBytes(32).toString('base64'), keyVersion: '1' });
const payload = () => ({ accessToken: randomBytes(24).toString('hex'), refreshToken: randomBytes(24).toString('hex'), deviceId: randomBytes(12).toString('hex'), scopes: ['wall', 'photos'] });

test('encrypted credential round trip retains device and scopes without serialized plaintext', async () => {
  const api = await cryptoModule(); const secret = payload(); const key = config();
  const envelope = api.sealVkPayload(secret, context, key);
  assert.ok(JSON.stringify(api.openVkPayload(envelope, context, key)) === JSON.stringify(secret), 'credential round trip failed');
  for (const value of [secret.accessToken, secret.refreshToken, secret.deviceId]) assert.equal(JSON.stringify(envelope).includes(value), false);
  assert.notEqual(api.sealVkPayload(secret, context, key).iv, envelope.iv);
});

test('authenticated envelope rejects changed account provider purpose tag key and key version', async () => {
  const api = await cryptoModule(); const key = config(); const envelope = api.sealVkPayload(payload(), context, key);
  for (const binding of [{ ...context, accountId: 'other-account' }, { ...context, provider: 'MAX' }, { ...context, purpose: 'OAUTH_INTENT' }]) {
    assert.throws(() => api.openVkPayload(envelope, binding, key));
  }
  const badTag = Buffer.from(envelope.tag, 'base64'); badTag[0] ^= 1;
  assert.throws(() => api.openVkPayload({ ...envelope, tag: badTag.toString('base64') }, context, key));
  assert.throws(() => api.openVkPayload(envelope, context, config()));
  assert.throws(() => api.openVkPayload({ ...envelope, keyVersion: '2' }, context, key));
});

test('encryption fails closed for missing noncanonical or wrong-sized keys', async () => {
  const api = await cryptoModule();
  for (const encryptionKey of ['', randomBytes(31).toString('base64'), randomBytes(32).toString('base64') + '\n', 'not-base64']) {
    assert.throws(() => api.sealVkPayload(payload(), context, { encryptionKey, keyVersion: '1' }));
  }
});
