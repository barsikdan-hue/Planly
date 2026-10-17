import { SocialProofError } from './launch.ts';
import { verifyLaunch } from './launch-proof.ts';

export function verifyMaxLaunch(raw: string, token: string, nowMs = Date.now()) {
  // MAX tokens are opaque. Require bounded printable non-whitespace credentials.
  if (typeof token !== 'string' || !/^[\x21-\x7e]{16,4096}$/.test(token)) throw new SocialProofError('SOCIAL_PROOF_NOT_CONFIGURED');
  return verifyLaunch(raw, token, 'MAX', nowMs);
}
