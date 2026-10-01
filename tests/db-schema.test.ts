import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../db/schema.ts', import.meta.url), 'utf8');

function has(pattern: RegExp, message: string) {
  assert.match(source, pattern, message);
}

test('PostgreSQL schema defines the MVP owner/content tables', () => {
  for (const name of ['users', 'sessions', 'loginRateLimits', 'socialAccounts', 'posts', 'postTargets', 'mediaAssets', 'postMedia', 'publications']) {
    has(new RegExp(`export\\s+const\\s+${name}\\s*=`), `missing table ${name}`);
  }
});

test('provider and status enums stay inside MVP v1 scope', () => {
  has(/socialProviderEnum\s*=\s*pgEnum\([^\n]+\[\s*['"]TELEGRAM['"]\s*,\s*['"]MAX['"]\s*\]/, 'provider enum must be TELEGRAM | MAX');
  has(/postStatusEnum\s*=\s*pgEnum\([^\n]+\[\s*['"]DRAFT['"]\s*,\s*['"]READY['"]\s*,\s*['"]ARCHIVED['"]\s*\]/, 'post status enum mismatch');
  has(/publicationStatusEnum\s*=\s*pgEnum\([\s\S]*?PUBLISHED[\s\S]*?FAILED[\s\S]*?REQUIRES_RECONNECT/, 'publication status enum missing terminal states');
});

test('schema preserves independent targets, ordered media, sessions and idempotency', () => {
  has(/tokenHash[^\n]+unique\(\)/, 'session token hash must be unique');
  has(/email[^\n]+unique\(\)/, 'owner email must be unique');
  has(/textOverride/, 'PostTarget text override missing');
  has(/scheduledAt/, 'PostTarget scheduledAt missing');
  has(/position/, 'ordered post-media position missing');
  has(/idempotencyKey[^\n]+unique\(\)/, 'publication idempotency key must be unique');
  has(/providerRemoteId/, 'provider remote ID missing');
  has(/normalizedErrorType/, 'normalized publication error missing');
});
