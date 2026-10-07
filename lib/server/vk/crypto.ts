import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { decodeVkKey, VkOAuthError, type VkCryptoConfig } from './config.ts';

export type VkEnvelope = { ciphertext: string; iv: string; tag: string; keyVersion: string };
export type VkBinding = { accountId: string; provider: string; purpose: string };
function aad(binding: VkBinding, keyVersion: string): Buffer {
  if (!binding.accountId || binding.provider !== 'VK' || !['CREDENTIALS', 'OAUTH_INTENT'].includes(binding.purpose) || !/^[A-Za-z0-9_-]{1,32}$/.test(keyVersion)) throw new VkOAuthError('AUTH');
  return Buffer.from(JSON.stringify([binding.accountId, binding.provider, binding.purpose, keyVersion]));
}
function decode(value: string, size?: number): Buffer {
  if (typeof value !== 'string' || value.length > 65536) throw new VkOAuthError('AUTH');
  const result = Buffer.from(value, 'base64');
  if (result.toString('base64') !== value || (size !== undefined && result.length !== size)) throw new VkOAuthError('AUTH');
  return result;
}
export function sealVkPayload(payload: unknown, binding: VkBinding, config: VkCryptoConfig): VkEnvelope {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', decodeVkKey(config.encryptionKey), iv);
  cipher.setAAD(aad(binding, config.keyVersion));
  const plaintext = JSON.stringify(payload);
  if (!plaintext || plaintext.length > 32000) throw new VkOAuthError('AUTH');
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), keyVersion: config.keyVersion };
}
export function openVkPayload(envelope: VkEnvelope, binding: VkBinding, config: VkCryptoConfig): unknown {
  try {
    if (envelope.keyVersion !== config.keyVersion) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', decodeVkKey(config.encryptionKey), decode(envelope.iv, 12));
    decipher.setAAD(aad(binding, envelope.keyVersion)); decipher.setAuthTag(decode(envelope.tag, 16));
    return JSON.parse(Buffer.concat([decipher.update(decode(envelope.ciphertext)), decipher.final()]).toString('utf8'));
  } catch { throw new VkOAuthError('AUTH'); }
}
