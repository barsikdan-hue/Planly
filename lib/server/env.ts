import { z } from 'zod';

const baseServerEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const sessionEnvSchema = z.object({
  SESSION_SECRET: z.string().min(32),
});

const ownerAuthEnvSchema = z.object({
  OWNER_EMAIL: z.string().email().transform((value) => value.trim().toLowerCase()),
  OWNER_PASSWORD_HASH: z.string().startsWith('scrypt$1$'),
});

const storageEnvSchema = z.object({
  S3_ENDPOINT: z.string().url(),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
});

const redisEnvSchema = z.object({
  REDIS_URL: z.string().url(),
});

export type ServerEnv = z.infer<typeof baseServerEnvSchema>;
export type SessionEnv = z.infer<typeof sessionEnvSchema>;
export type OwnerAuthEnv = z.infer<typeof ownerAuthEnvSchema>;
export type StorageEnv = z.infer<typeof storageEnvSchema>;
export type RedisEnv = z.infer<typeof redisEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;
let cachedSessionEnv: SessionEnv | undefined;
let cachedOwnerAuthEnv: OwnerAuthEnv | undefined;
let cachedStorageEnv: StorageEnv | undefined;
let cachedRedisEnv: RedisEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedServerEnv ??= baseServerEnvSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  });
  return cachedServerEnv;
}

export function getSessionEnv(): SessionEnv {
  cachedSessionEnv ??= sessionEnvSchema.parse({
    SESSION_SECRET: process.env.SESSION_SECRET,
  });
  return cachedSessionEnv;
}

export function getOwnerAuthEnv(): OwnerAuthEnv {
  cachedOwnerAuthEnv ??= ownerAuthEnvSchema.parse({
    OWNER_EMAIL: process.env.OWNER_EMAIL,
    OWNER_PASSWORD_HASH: process.env.OWNER_PASSWORD_HASH,
  });
  return cachedOwnerAuthEnv;
}

export function getStorageEnv(): StorageEnv {
  cachedStorageEnv ??= storageEnvSchema.parse({
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_PUBLIC_ENDPOINT: process.env.S3_PUBLIC_ENDPOINT || undefined,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  });
  return cachedStorageEnv;
}

export function getRedisEnv(): RedisEnv {
  if (cachedRedisEnv) return cachedRedisEnv;
  const parsed = redisEnvSchema.safeParse({ REDIS_URL: process.env.REDIS_URL });
  if (!parsed.success) throw new Error('Invalid REDIS_URL configuration');
  cachedRedisEnv = parsed.data;
  return cachedRedisEnv;
}

export function resetServerEnvForTests() {
  cachedServerEnv = undefined;
  cachedSessionEnv = undefined;
  cachedOwnerAuthEnv = undefined;
  cachedStorageEnv = undefined;
  cachedRedisEnv = undefined;
}
