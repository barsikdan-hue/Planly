export class VkOAuthError extends Error {
  readonly code: string;
  constructor(code: 'AUTH' | 'CONFIG' | 'NOT_FOUND' | 'STATE' | 'VALIDATION') {
    super(`VK authorization failed (${code})`);
    this.name = 'VkOAuthError';
    this.code = code;
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
