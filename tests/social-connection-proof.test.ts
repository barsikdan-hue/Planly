import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyTelegramLaunch, verifyMaxLaunch } from '../lib/server/social-connections/launch.ts';

// Independent Python stdlib hmac/hashlib calculation, using the literal fields below.
const vectors = [
  { provider: 'TELEGRAM', entry: 'verifyTelegramLaunch', token: '123456:TEST_only_never_real_secret', hash: '69a0837d2d6fe7e746088853b3277c18c4ed8ac21b641e018aa0b0ac94845022' },
  { provider: 'MAX', entry: 'verifyMaxLaunch', token: 'MAX_TEST_ONLY_secret', hash: '8186e3f3c2204d0aff07f0aaecffff4738c9ec902026d2d823b8e4bbbea5b53d' },
] as const;
const fields = { auth_date: '1800000000', query_id: 'fixture', signature: 'synthetic_signature', start_param: 'nonce_Ab-123', user: '{"id":42,"is_bot":false,"first_name":"Ada Lovelace"}' };
const now = 1800000000_000;
type Proof = { provider: string; humanId: string; startParam: string; authDateMs: number; replayDigest: string; displayName?: string };
type Verifier = (raw: string, token: string, now?: number) => Proof;
async function verifier(entry: string): Promise<Verifier> {
  return entry === 'verifyTelegramLaunch' ? verifyTelegramLaunch : verifyMaxLaunch;
}
function signed(token: string, overrides: Record<string, string | undefined> = {}) {
  const data: Record<string, string | undefined> = { ...fields, ...overrides };
  const entries = Object.entries(data).filter((entry): entry is [string, string] => entry[1] !== undefined);
  const key = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', key).update(entries.toSorted(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => `${k}=${v}`).join('\n')).digest('hex');
  return new URLSearchParams([...entries, ['hash', hash]]).toString();
}
for (const vector of vectors) {
  test(`${vector.provider} accepts independent known answer including signature and raw user JSON`, async () => {
    const verify = await verifier(vector.entry);
    const result = verify(new URLSearchParams({ ...fields, hash: vector.hash }).toString(), vector.token, now);
    assert.deepEqual({ ...result, replayDigest: '<digest>' }, { provider: vector.provider, humanId: '42', startParam: 'nonce_Ab-123', authDateMs: now, replayDigest: '<digest>', displayName: 'Ada Lovelace' });
    assert.match(result.replayDigest, /^[a-f0-9]{64}$/);
  });
  test(`${vector.provider} rejects forged, tampered, duplicate and malformed proofs with safe errors`, async () => {
    const verify = await verifier(vector.entry);
    const valid = new URLSearchParams({ ...fields, hash: vector.hash }).toString();
    const invalid = [
      valid.replace(vector.hash, '0'.repeat(64)), valid.replace('nonce_Ab-123', 'other'), valid.replace('%3A42', '%3A43'),
      valid + '&hash=' + vector.hash, valid + '&auth_date=1800000000', valid + '&%75ser=x',
      valid + '&x=%zz', valid + '&x=%C0%AF', valid + '&=x', valid + '&a%0Ab=c', valid + '&x=%0Auser%3Dx',
      valid + '&x', valid + '&', valid + '&x=' + 'a'.repeat(9000), 'a'.repeat(17000),
      signed(vector.token, { auth_date: '1799999699' }), signed(vector.token, { auth_date: '1800000031' }),
      signed(vector.token, { auth_date: '1.8e9' }), signed(vector.token, { auth_date: '1800000000.0' }),
      signed(vector.token, { user: '{"id":9007199254740993}' }), signed(vector.token, { user: '{"id":"42"}' }),
      signed(vector.token, { user: '{}' }), signed(vector.token, { user: '{"id":0}' }), signed(vector.token, { user: '{"id":42,"is_bot":true}' }),
      signed(vector.token, { user: '{"id":42,"is_bot":"false"}' }), signed(vector.token, { user: 'null' }), signed(vector.token, { user: '{' }),
      signed(vector.token, { start_param: undefined }), signed(vector.token, { start_param: '' }), signed(vector.token, { start_param: '  ' }),
      valid.replace(/&hash=[^&]+/, ''), signed(vector.token, { signature: undefined }).replace(/signature=[^&]*&?/, '') + '&signature=synthetic_signature',
    ];
    for (const raw of invalid) assert.throws(() => verify(raw, vector.token, now), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, 'SocialProofError');
      assert.match((error as Error & { code: string }).code, /^SOCIAL_PROOF_/);
      assert.equal(error.message.includes(vector.token), false);
      assert.equal(error.message.includes(raw), false);
      return true;
    });
    for (const token of ['', '  ', 'bad token\n', 'invalid', vector.token + 'wrong']) assert.throws(() => verify(valid, token, now));
  });
  test(`${vector.provider} canonical replay digest ignores query order and percent spelling`, async () => {
    const verify = await verifier(vector.entry);
    const first = new URLSearchParams({ ...fields, hash: vector.hash }).toString();
    const equivalent = first.split('&').reverse().join('&').replaceAll('+', '%20').replaceAll('%3A', '%3a');
    assert.equal(verify(first, vector.token, now).replayDigest, verify(equivalent, vector.token, now).replayDigest);
    assert.equal(verify(first, vector.token, now + 300000).humanId, '42');
    assert.equal(verify(first, vector.token, now - 30000).humanId, '42');
    const rawJson = signed(vector.token, { user: '{ "first_name": " Ada ", "id": 42 }' });
    assert.equal(verify(rawJson, vector.token, now).displayName, 'Ada');
  });
}
