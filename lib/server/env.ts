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

export type ServerEnv = z.infer<typeof baseServerEnvSchema>;
export type SessionEnv = z.infer<typeof sessionEnvSchema>;
export type OwnerAuthEnv = z.infer<typeof ownerAuthEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;
let cachedSessionEnv: SessionEnv | undefined;
let cachedOwnerAuthEnv: OwnerAuthEnv | undefined;

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

export function resetServerEnvForTests() {
  cachedServerEnv = undefined;
  cachedSessionEnv = undefined;
  cachedOwnerAuthEnv = undefined;
}
