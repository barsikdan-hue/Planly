import { createTelegramConnector } from './telegram.ts';
import type { SocialConnector, SocialProvider } from './types.ts';

function notImplementedConnector(provider: SocialProvider): SocialConnector {
  return {
    provider,
    async publish() {
      return {
        ok: false,
        errorType: 'VALIDATION',
        code: 'PROVIDER_NOT_IMPLEMENTED',
        message: `${provider} connector is not implemented yet.`,
      };
    },
  };
}

export function resolveConnector(provider: SocialProvider): SocialConnector {
  if (provider === 'TELEGRAM' && process.env.TELEGRAM_BOT_TOKEN) return createTelegramConnector({token:process.env.TELEGRAM_BOT_TOKEN});
  return notImplementedConnector(provider);
}
