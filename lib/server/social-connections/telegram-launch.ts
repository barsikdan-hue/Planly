import { SocialProofError } from './launch.ts';
import { verifyLaunch } from './launch-proof.ts';

export function verifyTelegramLaunch(raw: string, token: string, nowMs = Date.now()) {
  if (typeof token !== 'string' || token.length > 4096 || !/^[1-9]\d*:[A-Za-z0-9_-]{20,}$/.test(token)) throw new SocialProofError('SOCIAL_PROOF_NOT_CONFIGURED');
  return verifyLaunch(raw, token, 'TELEGRAM', nowMs);
}
