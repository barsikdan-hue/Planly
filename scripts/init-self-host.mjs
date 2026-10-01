#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { hashOwnerPassword } from '../lib/server/auth/password.ts';

try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--email' || !/^[^\s'@]+@[^\s'@]+\.[^\s'@]+$/.test(args[1]) || args[1].length > 320) {
    throw new Error('Usage: node scripts/init-self-host.mjs --email owner@example.com; supply password on stdin.');
  }
  let password = '';
  for await (const chunk of process.stdin) {
    password += chunk;
    if (password.length > 1026) throw new Error('Password is too long.');
  }
  password = password.replace(/[\r\n]+$/, '');
  if (password.length < 12 || password.length > 1024) throw new Error('Use an owner password of 12–1024 characters.');
  const env = {
    OWNER_EMAIL: args[1].toLowerCase(),
    OWNER_PASSWORD_HASH: await hashOwnerPassword(password),
    SESSION_SECRET: randomBytes(48).toString('hex'),
    POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
    S3_ACCESS_KEY_ID: randomBytes(16).toString('hex'),
    S3_SECRET_ACCESS_KEY: randomBytes(32).toString('hex'),
    S3_BUCKET: 'planly-media',
    S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
  };
  const content = Object.entries(env).map(([key, value]) => `${key}='${value}'`).join('\n') + '\n';
  await writeFile('.env.self-host', content, { flag: 'wx', mode: 0o600 });
  console.log('Created .env.self-host. Credentials were not printed; keep this file private.');
} catch (error) {
  console.error(error?.code === 'EEXIST' ? '.env.self-host already exists; no credentials were changed.' : 'Self-host setup failed. ' + (error instanceof Error ? error.message : 'Check inputs.'));
  process.exitCode = 1;
}
