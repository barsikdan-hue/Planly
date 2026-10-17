import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SocialProofError, type VerifiedSocialLaunch } from './launch.ts';

// Both platforms' bot-token HMAC excludes only hash. In particular, Telegram's
// third-party Ed25519 exclusion of signature must NOT be applied to this path.
export function verifyLaunch(raw: string, token: string, provider: VerifiedSocialLaunch['provider'], nowMs: number): VerifiedSocialLaunch {
  const invalid = () => { throw new SocialProofError(); };
  if (typeof raw !== 'string' || raw.length === 0 || Buffer.byteLength(raw) > 16384) return invalid();
  const pairs = raw.split('&');
  if (pairs.length > 32) return invalid();
  const fields = new Map<string, string>();
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    if (separator <= 0) return invalid();
    let key: string, value: string;
    try {
      key = decodeURIComponent(pair.slice(0, separator).replaceAll('+', ' '));
      value = decodeURIComponent(pair.slice(separator + 1).replaceAll('+', ' '));
    } catch { return invalid(); }
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || fields.has(key) || Buffer.byteLength(value) > 8192 || /[\u0000-\u001f\u007f]/.test(value)) return invalid();
    fields.set(key, value);
  }
  const hash = fields.get('hash');
  if (!hash || !/^[a-fA-F0-9]{64}$/.test(hash)) return invalid();
  fields.delete('hash');
  const canonical = [...fields].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update(canonical).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return invalid();
  const date = fields.get('auth_date');
  if (!date || !/^[1-9]\d{0,12}$/.test(date)) return invalid();
  const authDateMs = Number(date) * 1000;
  if (!Number.isSafeInteger(authDateMs) || !Number.isSafeInteger(nowMs) || nowMs <= 0) return invalid();
  if (nowMs - authDateMs > 300000 || authDateMs - nowMs > 30000) throw new SocialProofError('SOCIAL_PROOF_EXPIRED');
  const startParam = fields.get('start_param');
  if (!startParam || !startParam.trim() || startParam.length > 512) return invalid();
  let user: unknown;
  try { user = JSON.parse(fields.get('user') ?? ''); } catch { return invalid(); }
  if (!user || typeof user !== 'object' || Array.isArray(user)) return invalid();
  const person = user as Record<string, unknown>;
  if (!Number.isSafeInteger(person.id) || Number(person.id) <= 0 || (person.is_bot !== undefined && person.is_bot !== false)) return invalid();
  const displayName = typeof person.first_name === 'string' ? person.first_name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) : '';
  return {
    provider, humanId: String(person.id), startParam, authDateMs,
    replayDigest: createHash('sha256').update(`${provider}\n${canonical}`).digest('hex'),
    ...(displayName ? { displayName } : {}),
  };
}
