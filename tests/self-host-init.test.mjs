import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyOwnerPassword } from '../lib/server/auth/password.ts';

const script = new URL('../scripts/init-self-host.mjs', import.meta.url);
const password = 'Test-owner-password-2026';
const run = (cwd, email = 'Owner@example.test', input = password) => spawnSync(
  process.execPath, ['--experimental-strip-types', script.pathname, '--email', email],
  { cwd, input: `${input}\n`, encoding: 'utf8', timeout: 10000 },
);
const configValues = source => Object.fromEntries(source.trim().split('\n').map(line => {
  const split = line.indexOf('=');
  return [line.slice(0, split), line.slice(split + 1).replace(/^'|'$/g, '')];
}));

test('self-host setup writes private credentials, a usable password hash and literal dollar signs', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'planly-init-'));
  try {
    const result = run(cwd);
    assert.equal(result.status, 0, result.stderr);
    const source = await readFile(join(cwd, '.env.self-host'), 'utf8');
    const env = configValues(source);
    assert.equal(env.OWNER_EMAIL, 'owner@example.test');
    assert.equal(await verifyOwnerPassword(password, env.OWNER_PASSWORD_HASH), true);
    assert.match(source, /OWNER_PASSWORD_HASH='scrypt\$1\$/);
    assert.equal(env.S3_PUBLIC_ENDPOINT, 'http://localhost:9000');
    assert.equal(env.S3_BUCKET, 'planly-media');
    for (const key of ['SESSION_SECRET', 'POSTGRES_PASSWORD', 'S3_SECRET_ACCESS_KEY']) {
      assert.ok(env[key].length >= 32);
      assert.ok(!result.stdout.includes(env[key]) && !result.stderr.includes(env[key]));
    }
    assert.ok(!source.includes(password));
    assert.equal((await stat(join(cwd, '.env.self-host'))).mode & 0o777, 0o600);
    const repeated = run(cwd);
    assert.notEqual(repeated.status, 0);
    assert.equal(await readFile(join(cwd, '.env.self-host'), 'utf8'), source, 'existing credentials must survive rerun');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('invalid email or weak password cannot create a configuration file', async () => {
  for (const [email, input] of [['invalid', password], ['owner@example.test', 'short']]) {
    const cwd = await mkdtemp(join(tmpdir(), 'planly-init-'));
    try {
      const result = run(cwd, email, input);
      assert.notEqual(result.status, 0);
      await assert.rejects(readFile(join(cwd, '.env.self-host')), { code: 'ENOENT' });
      assert.ok(!result.stdout.includes(input));
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }
});
