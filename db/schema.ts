import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const createdAt = timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const socialProviderEnum = pgEnum('social_provider', ['TELEGRAM', 'MAX']);
export const socialConnectionStatusEnum = pgEnum('social_connection_status', ['DISCONNECTED', 'CONNECTED', 'ERROR']);
export const postStatusEnum = pgEnum('post_status', ['DRAFT', 'READY', 'ARCHIVED']);
export const mediaSourceEnum = pgEnum('media_source', ['UPLOAD', 'AI_GENERATED']);
export const publicationStatusEnum = pgEnum('publication_status', [
  'SCHEDULED',
  'QUEUED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
  'CANCELLED',
  'REQUIRES_RECONNECT',
]);
export const publicationErrorTypeEnum = pgEnum('publication_error_type', [
  'TEMPORARY',
  'AUTH',
  'VALIDATION',
  'PERMANENT',
]);

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  createdAt,
  updatedAt,
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt,
}, (table) => [
  index('sessions_user_id_idx').on(table.userId),
  index('sessions_expires_at_idx').on(table.expiresAt),
]);

export const loginRateLimits = pgTable('login_rate_limits', {
  keyHash: text('key_hash').primaryKey(),
  failedCount: integer('failed_count').notNull().default(0),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt,
});

export const socialAccounts = pgTable('social_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: socialProviderEnum('provider').notNull(),
  providerAccountId: text('provider_account_id'),
  displayName: text('display_name').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  connectionStatus: socialConnectionStatusEnum('connection_status').notNull().default('DISCONNECTED'),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex('social_accounts_user_provider_uidx').on(table.userId, table.provider),
  index('social_accounts_user_id_idx').on(table.userId),
]);

export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  baseText: text('base_text').notNull(),
  status: postStatusEnum('status').notNull().default('DRAFT'),
  createdAt,
  updatedAt,
}, (table) => [
  index('posts_user_id_idx').on(table.userId),
  index('posts_status_idx').on(table.status),
]);

export const postTargets = pgTable('post_targets', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  socialAccountId: text('social_account_id').notNull().references(() => socialAccounts.id),
  textOverride: text('text_override'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' }),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex('post_targets_post_account_uidx').on(table.postId, table.socialAccountId),
  index('post_targets_scheduled_at_idx').on(table.scheduledAt),
]);

export const mediaAssets = pgTable('media_assets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull().unique(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  checksum: text('checksum').notNull(),
  width: integer('width'),
  height: integer('height'),
  durationMs: integer('duration_ms'),
  source: mediaSourceEnum('source').notNull().default('UPLOAD'),
  createdAt,
  updatedAt,
}, (table) => [
  index('media_assets_user_id_idx').on(table.userId),
]);

export const postMedia = pgTable('post_media', {
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  mediaId: text('media_id').notNull().references(() => mediaAssets.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
}, (table) => [
  primaryKey({ columns: [table.postId, table.mediaId] }),
  uniqueIndex('post_media_post_position_uidx').on(table.postId, table.position),
]);

export const publications = pgTable('publications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  postTargetId: text('post_target_id').notNull().references(() => postTargets.id, { onDelete: 'cascade' }),
  provider: socialProviderEnum('provider').notNull(),
  status: publicationStatusEnum('status').notNull().default('SCHEDULED'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' }),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
  providerRemoteId: text('provider_remote_id'),
  providerUrl: text('provider_url'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true, mode: 'date' }),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true, mode: 'date' }),
  normalizedErrorType: publicationErrorTypeEnum('normalized_error_type'),
  providerErrorCode: text('provider_error_code'),
  providerErrorMessage: text('provider_error_message'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  createdAt,
  updatedAt,
}, (table) => [
  index('publications_user_id_idx').on(table.userId),
  index('publications_status_idx').on(table.status),
  index('publications_scheduled_at_idx').on(table.scheduledAt),
]);
