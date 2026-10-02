import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const requiredEnv = [
  'DATABASE_URL',
  'OWNER_EMAIL',
  'OWNER_PASSWORD_HASH',
  'SESSION_SECRET',
  'S3_ENDPOINT',
  'S3_PUBLIC_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'REDIS_URL',
  'NODE_ENV', 'TELEGRAM_BOT_TOKEN',
];

test('.env.example lists required server variables with blank values only', async () => {
  const source = await read('.env.example');
  const lines = source.split(/\r?\n/).filter(Boolean);
  assert.deepEqual(lines.map(line => line.split('=')[0]), requiredEnv);
  assert.ok(lines.every(line => line.endsWith('=')), 'env example must not contain sample secret values');
});

test('Render blueprint contains web + PostgreSQL only, health check and standard Next start', async () => {
  const source = await read('render.yaml');
  assert.match(source, /type:\s*web/);
  assert.match(source, /healthCheckPath:\s*\/api\/health/);
  assert.match(source, /startCommand:\s*pnpm start/);
  assert.match(source, /databases:/);
  assert.match(source, /DATABASE_URL/);
  assert.doesNotMatch(source, /type:\s*(redis|keyvalue|worker)/i);
  for (const key of ['OWNER_PASSWORD_HASH','SESSION_SECRET','S3_SECRET_ACCESS_KEY']) {
    assert.match(source, new RegExp(`key:\\s*${key}[\\s\\S]*?sync:\\s*false`));
  }
});

test('client code does not read server secret environment variables', async () => {
  const paths = [
    'components/planner/app.tsx',
    'components/planner/composer.tsx',
    'components/planner/settings.tsx',
    'lib/client/planly-api.ts',
  ];
  const source = (await Promise.all(paths.map(read))).join('\n');
  assert.doesNotMatch(source, /process\.env\.(DATABASE_URL|OWNER_PASSWORD_HASH|SESSION_SECRET|S3_ACCESS_KEY_ID|S3_SECRET_ACCESS_KEY|REDIS_URL)/);
});
