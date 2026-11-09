import type { PublicationErrorType, VkPublicationDiagnostic } from '../connectors/types.ts';

export type VkOAuthDiagnostic = {
  stage: 'CALLBACK' | 'OAUTH_INTENT' | 'TOKEN_EXCHANGE' | 'GRANT_VALIDATION' | 'COMMUNITY_VALIDATION' | 'CREDENTIAL_PERSISTENCE';
  reason: 'FAILED' | 'INVALID_SCOPE' | 'INVALID_GRANT' | 'INVALID_CLIENT' | 'ACCESS_DENIED' | 'PROVIDER_REJECTED' | 'HTTP_REJECTED' | 'INVALID_RESPONSE' | 'TRANSPORT_FAILED' | 'STATE_MISMATCH' | 'MISSING_PUBLISHING_SCOPES';
};

export type VkInvalidGrantReason = 'PKCE_MISMATCH' | 'CODE_VERIFIER_REJECTED' | 'CODE_INVALID_EXPIRED_OR_USED' | 'DEVICE_ID_REJECTED' | 'REDIRECT_REJECTED' | 'SERVICE_TOKEN_REJECTED' | 'OTHER_INVALID_GRANT';

export type VkDescriptionState = 'MISSING' | 'NON_STRING' | 'EMPTY' | 'PRESENT' | 'TOO_LONG';
export type VkDescriptionMention = 'PKCE' | 'CODE' | 'DEVICE_ID' | 'REDIRECT_URI' | 'SERVICE_TOKEN';
export type VkServiceTokenTerm = 'INVALID' | 'MISSING' | 'REQUIRED' | 'EXPIRED' | 'REVOKED' | 'IP' | 'APPLICATION' | 'CONFIDENTIAL' | 'RESTRICTED' | 'ALLOWLIST';
export type VkTokenExchangeMetadata = {
  providerHttpStatus: number;
  providerDescriptionState: VkDescriptionState;
  providerDescriptionMentions: readonly VkDescriptionMention[];
  providerServiceTokenTerms?: readonly VkServiceTokenTerm[];
};

export type VkCommunityValidationMetadata = {
  connectorCode: 'VK_COMMUNITY' | 'VK_POST_PERMISSION' | 'VK_RECONNECT_REQUIRED' | 'VK_API_VERSION' | 'VK_UNAVAILABLE' |
    'VK_METHOD_PROFILE_DENIED' | 'VK_GROUP_TOKEN_METHOD_DENIED' | 'VK_API_ACCESS_NOT_GRANTED' |
    'VK_5' | 'VK_6' | 'VK_7' | 'VK_9' | 'VK_14' | 'VK_17' | 'VK_20' | 'VK_22' | 'VK_24' | 'VK_25' | 'VK_28' | 'VK_29' |
    'VK_100' | 'VK_118' | 'VK_121' | 'VK_214' | 'VK_219' | 'VK_220' | 'VK_222' | 'VK_224' | 'VK_225' | 'VK_704' | 'VK_1117';
  errorType: PublicationErrorType;
  vkErrorCode?: number;
  networkErrorClass?: VkPublicationDiagnostic['networkErrorClass'];
};

export class VkOAuthError extends Error {
  readonly code: string;
  readonly diagnostic?: VkOAuthDiagnostic;
  readonly invalidGrantReason?: VkInvalidGrantReason;
  readonly tokenExchangeMetadata?: VkTokenExchangeMetadata;
  readonly communityValidationMetadata?: VkCommunityValidationMetadata;
  constructor(code: 'AUTH' | 'CONFIG' | 'NOT_FOUND' | 'STATE' | 'VALIDATION', diagnostic?: VkOAuthDiagnostic, invalidGrantReason?: VkInvalidGrantReason, tokenExchangeMetadata?: VkTokenExchangeMetadata, communityValidationMetadata?: VkCommunityValidationMetadata) {
    super(`VK authorization failed (${code})`);
    this.name = 'VkOAuthError';
    this.code = code;
    this.diagnostic = diagnostic;
    this.invalidGrantReason = invalidGrantReason;
    this.tokenExchangeMetadata = tokenExchangeMetadata;
    this.communityValidationMetadata = communityValidationMetadata;
  }
}

export type VkCryptoConfig = { encryptionKey: string; keyVersion: string };
export type VkConfig = VkCryptoConfig & { clientId: string; serviceToken: string; redirectUri: string };

export function decodeVkKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) throw new VkOAuthError('CONFIG');
  return key;
}

export function getVkConfig(env: Record<string, string | undefined> = process.env): VkConfig {
  const clientId = env.VK_CLIENT_ID ?? ''; const serviceToken = env.VK_SERVICE_TOKEN ?? '';
  const redirectUri = env.VK_REDIRECT_URI ?? ''; const encryptionKey = env.VK_CREDENTIAL_ENCRYPTION_KEY ?? '';
  const keyVersion = env.VK_CREDENTIAL_KEY_VERSION ?? '';
  if (!/^[1-9]\d*$/.test(clientId) || !serviceToken || serviceToken !== serviceToken.trim() || !/^[A-Za-z0-9_-]{1,32}$/.test(keyVersion)) throw new VkOAuthError('CONFIG');
  decodeVkKey(encryptionKey);
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new Error();
  } catch { throw new VkOAuthError('CONFIG'); }
  return { clientId, serviceToken, redirectUri, encryptionKey, keyVersion };
}
