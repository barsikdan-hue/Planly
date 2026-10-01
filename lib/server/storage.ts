import { createHash, createHmac } from 'node:crypto';
import { getStorageEnv, type StorageEnv } from './env.ts';

export type ObjectStorage = {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  signedGetUrl(key: string, expiresSeconds?: number): Promise<string>;
};

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}
function stamp(now: Date) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, date: iso.slice(0, 8) };
}
function signingKey(secret: string, date: string, region: string) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), 's3'), 'aws4_request');
}
function encodePart(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
function objectUrl(config: StorageEnv, key: string): URL {
  const base = new URL(config.S3_ENDPOINT);
  const prefix = base.pathname.replace(/\/$/, '');
  base.pathname = `${prefix}/${encodePart(config.S3_BUCKET)}/${key.split('/').map(encodePart).join('/')}`;
  base.search = '';
  base.hash = '';
  return base;
}

function authorization(
  config: StorageEnv,
  method: string,
  url: URL,
  payloadHash: string,
  now: Date,
) {
  const { amzDate, date } = stamp(now);
  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${config.S3_REGION}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const signature = createHmac('sha256', signingKey(config.S3_SECRET_ACCESS_KEY, date, config.S3_REGION)).update(stringToSign).digest('hex');
  return {
    amzDate,
    value: `AWS4-HMAC-SHA256 Credential=${config.S3_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function signedMutation(config: StorageEnv, method: 'PUT' | 'DELETE', key: string, bytes = new Uint8Array(), contentType?: string) {
  const url = objectUrl(config, key);
  const payloadHash = sha256(bytes);
  const auth = authorization(config, method, url, payloadHash, new Date());
  const headers = new Headers({
    authorization: auth.value,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': auth.amzDate,
  });
  if (contentType) headers.set('content-type', contentType);
  const response = await fetch(url, { method, headers, body: method === 'PUT' ? bytes : undefined });
  if (!response.ok) throw new Error(`Object storage ${method} failed with status ${response.status}`);
}

function presignedGet(config: StorageEnv, key: string, expiresSeconds: number): string {
  const now = new Date();
  const { amzDate, date } = stamp(now);
  const scope = `${date}/${config.S3_REGION}/s3/aws4_request`;
  const url = objectUrl(config, key);
  const params: Array<[string, string]> = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${config.S3_ACCESS_KEY_ID}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(Math.max(1, Math.min(900, Math.floor(expiresSeconds))))],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  const canonicalQuery = params
    .map(([name, value]) => [encodePart(name), encodePart(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${value}`).join('&');
  const canonicalRequest = ['GET', url.pathname, canonicalQuery, `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const signature = createHmac('sha256', signingKey(config.S3_SECRET_ACCESS_KEY, date, config.S3_REGION)).update(stringToSign).digest('hex');
  url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return url.toString();
}

export function createS3Storage(config: StorageEnv = getStorageEnv()): ObjectStorage {
  return {
    async put(key, bytes, contentType) { await signedMutation(config, 'PUT', key, bytes, contentType); },
    async delete(key) { await signedMutation(config, 'DELETE', key); },
    async signedGetUrl(key, expiresSeconds = 300) { return presignedGet(config, key, expiresSeconds); },
  };
}

let storage: ObjectStorage | undefined;
export function getObjectStorage(): ObjectStorage {
  storage ??= createS3Storage();
  return storage;
}
