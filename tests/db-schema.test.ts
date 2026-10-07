import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema.ts';

const source = await readFile(new URL('../db/schema.ts', import.meta.url), 'utf8');

function has(pattern: RegExp, message: string) {
  assert.match(source, pattern, message);
}

test('PostgreSQL schema defines the MVP owner/content tables', () => {
  for (const name of ['users', 'sessions', 'loginRateLimits', 'socialAccounts', 'posts', 'postTargets', 'mediaAssets', 'postMedia', 'publications']) {
    has(new RegExp(`export\\s+const\\s+${name}\\s*=`), `missing table ${name}`);
  }
});

test('provider and status enums stay inside approved Phase 7A scope', () => {
  has(/socialProviderEnum\s*=\s*pgEnum\([^\n]+\[\s*['"]TELEGRAM['"]\s*,\s*['"]MAX['"]\s*,\s*['"]VK['"]\s*\]/, 'provider enum must be TELEGRAM | MAX | VK');
  has(/postStatusEnum\s*=\s*pgEnum\([^\n]+\[\s*['"]DRAFT['"]\s*,\s*['"]READY['"]\s*,\s*['"]ARCHIVED['"]\s*\]/, 'post status enum mismatch');
  has(/publicationStatusEnum\s*=\s*pgEnum\([\s\S]*?PUBLISHED[\s\S]*?FAILED[\s\S]*?REQUIRES_RECONNECT/, 'publication status enum missing terminal states');
});

test('schema preserves independent targets, ordered media, sessions and idempotency', () => {
  has(/tokenHash[^\n]+unique\(\)/, 'session token hash must be unique');
  has(/email[^\n]+unique\(\)/, 'owner email must be unique');
  has(/textOverride/, 'PostTarget text override missing');
  has(/scheduledAt/, 'PostTarget scheduledAt missing');
  has(/active:\s*boolean\(['"]active['"]\)[^\n]*default\(true\)/, 'PostTarget active marker missing');
  has(/position/, 'ordered post-media position missing');
  has(/idempotencyKey[^\n]+unique\(\)/, 'publication idempotency key must be unique');
  has(/providerRemoteId/, 'provider remote ID missing');
  has(/normalizedErrorType/, 'normalized publication error missing');
});

test('library items have independent owner/content storage with READY default', () => {
  assert.ok('libraryItems' in schema, 'missing libraryItems table');
  assert.ok('libraryItemStatusEnum' in schema, 'missing libraryItemStatusEnum');
  const library = schema.libraryItems;
  assert.deepEqual(schema.libraryItemStatusEnum.enumValues, ['READY', 'USED', 'ARCHIVED']);
  const config = getTableConfig(library);
  assert.equal(config.name, 'library_items');
  assert.deepEqual(config.columns.map(c => c.name), ['id', 'user_id', 'title', 'body_text', 'status', 'created_at', 'updated_at']);
  assert.equal(library.id.primary, true);
  assert.equal(library.title.notNull, false);
  assert.equal(library.bodyText.notNull, true);
  assert.equal(library.status.default, 'READY');
  for (const column of [library.createdAt, library.updatedAt]) {
    assert.equal(column.notNull, true);
    assert.equal(column.getSQLType(), 'timestamp with time zone');
  }
  const owner = config.foreignKeys[0];
  assert.equal(owner.reference().foreignTable, schema.users);
  assert.equal(owner.onDelete, 'cascade');
  assert.ok(config.indexes.some(index => index.config.columns.length === 1 && 'name' in index.config.columns[0] && index.config.columns[0].name === 'user_id'));
});

test('library media references shared assets with unique ordered positions and cascade deletion', () => {
  assert.ok('libraryItemMedia' in schema, 'missing libraryItemMedia table');
  const media = schema.libraryItemMedia;
  const config = getTableConfig(media);
  assert.equal(config.name, 'library_item_media');
  assert.deepEqual(config.primaryKeys[0].columns.map(column => column.name), ['library_item_id', 'media_id']);
  assert.equal(media.position.notNull, true);
  const ordered = config.indexes.find(index => index.config.unique);
  assert.ok(ordered);
  assert.deepEqual(ordered.config.columns.map(column => 'name' in column ? column.name : undefined), ['library_item_id', 'position']);
  assert.deepEqual(config.foreignKeys.map(key => key.reference().foreignTable), [schema.libraryItems, schema.mediaAssets]);
  assert.ok(config.foreignKeys.every(key => key.onDelete === 'cascade'));
});

test('post provenance allows existing posts and protects one source post without cascade deletion', () => {
  assert.ok('sourceLibraryItemId' in schema.posts, 'missing posts.sourceLibraryItemId');
  const provenance = schema.posts.sourceLibraryItemId;
  const config = getTableConfig(schema.posts);
  assert.equal(provenance.notNull, false);
  assert.equal(provenance.name, 'source_library_item_id');
  const foreignKey = config.foreignKeys.find(key => key.reference().columns[0] === provenance);
  assert.ok(foreignKey);
  assert.equal(foreignKey.reference().foreignTable, schema.libraryItems);
  assert.equal(foreignKey.onDelete, 'set null');
  assert.ok(config.indexes.some(index => index.config.unique && index.config.columns.length === 1 && 'name' in index.config.columns[0] && index.config.columns[0].name === 'source_library_item_id'));
});
