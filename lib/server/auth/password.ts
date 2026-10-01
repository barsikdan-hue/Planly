import { promisify } from 'node:util';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const scrypt = promisify(scryptCallback);
const VERSION = '1';
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

export async function hashOwnerPassword(password: string): Promise<string> {
  if (!password) throw new Error('Password must not be empty.');
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEMORY }) as Buffer;
  return ['scrypt', VERSION, String(N), String(R), String(P), salt.toString('base64url'), derived.toString('base64url')].join('$');
}

export async function verifyOwnerPassword(password: string, encodedHash: string): Promise<boolean> {
  try {
    const [algorithm, version, nText, rText, pText, saltText, hashText, ...extra] = encodedHash.split('$');
    if (algorithm !== 'scrypt' || version !== VERSION || extra.length) return false;
    const n = Number(nText);
    const r = Number(rText);
    const p = Number(pText);
    if (n !== N || r !== R || p !== P || !saltText || !hashText) return false;

    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(hashText, 'base64url');
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;

    const actual = await scrypt(password, salt, expected.length, { N: n, r, p, maxmem: MAX_MEMORY }) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
