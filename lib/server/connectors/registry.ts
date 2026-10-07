import { createMaxConnector } from './max.ts';
import { createTelegramConnector } from './telegram.ts';
import { createVkConnector } from './vk.ts';
import { getVkAccessToken } from '../vk/credentials.ts';
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
  if (provider === 'VK') return createVkConnector({ getAccessToken: getVkAccessToken });
  if (provider === 'TELEGRAM' && process.env.TELEGRAM_BOT_TOKEN) return createTelegramConnector({token:process.env.TELEGRAM_BOT_TOKEN});
  if (provider === 'MAX' && process.env.MAX_BOT_TOKEN) return createMaxConnector({token:process.env.MAX_BOT_TOKEN});
  return notImplementedConnector(provider);
}
