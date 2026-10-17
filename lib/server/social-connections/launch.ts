export type VerifiedSocialLaunch = {
  provider: 'TELEGRAM' | 'MAX';
  humanId: string;
  startParam: string;
  authDateMs: number;
  replayDigest: string;
  displayName?: string;
};

export class SocialProofError extends Error {
  readonly code: 'SOCIAL_PROOF_INVALID' | 'SOCIAL_PROOF_EXPIRED' | 'SOCIAL_PROOF_NOT_CONFIGURED';
  constructor(code: SocialProofError['code'] = 'SOCIAL_PROOF_INVALID') {
    super('Social identity proof could not be verified.');
    this.name = 'SocialProofError';
    this.code = code;
  }
}

export { verifyTelegramLaunch } from './telegram-launch.ts';
export { verifyMaxLaunch } from './max-launch.ts';
