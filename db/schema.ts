import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { AnalyticsError, AnalyticsMetric, MetricObservation } from '../lib/contracts/analytics.ts';
import type { SchedulingPlanReceipt } from '../lib/contracts/scheduling-plan.ts';
import type { LibraryItemDto } from '../lib/contracts/library.ts';
import type { LibraryBatchIntent, LibraryBatchReceipt } from '../lib/contracts/library-batch.ts';

const createdAt = timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const socialProviderEnum = pgEnum('social_provider', ['TELEGRAM', 'MAX', 'VK']);
export const vkRefreshStateEnum = pgEnum('vk_refresh_state', ['READY', 'UNCERTAIN']);
export const socialConnectionStatusEnum = pgEnum('social_connection_status', ['DISCONNECTED', 'CONNECTED', 'ERROR']);
export const postStatusEnum = pgEnum('post_status', ['DRAFT', 'READY', 'ARCHIVED']);
export const libraryItemStatusEnum = pgEnum('library_item_status', ['READY', 'USED', 'ARCHIVED']);
export const libraryCreationStateEnum = pgEnum('library_creation_state', ['CREATED', 'DELETED']);
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

export const userRoleEnum = pgEnum('user_role', ['ADMIN', 'USER']);
export const userAccessStateEnum = pgEnum('user_access_state', ['ACTIVE', 'BLOCKED']);
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  role: userRoleEnum('role').notNull().default('USER'),
  accessState: userAccessStateEnum('access_state').notNull().default('BLOCKED'),
  passwordHash: text('password_hash'),
  authInitialized: boolean('auth_initialized').notNull().default(false),
  sessionVersion: integer('session_version').notNull().default(0),
  createdAt,
  updatedAt,
});

export const schedulingPlanOperations = pgTable('scheduling_plan_operations', {
  userId: text('user_id').notNull().references(() => users.id, {onDelete:'cascade'}),
  operationId: uuid('operation_id').notNull(),
  requestHash: text('request_hash').notNull(),
  receipt: jsonb('receipt').$type<SchedulingPlanReceipt>().notNull(),
  createdAt,
}, table => [primaryKey({columns:[table.userId,table.operationId]}),check('scheduling_plan_request_hash_format',sql`${table.requestHash} ~ '^[a-f0-9]{64}$'`)]);

// Historical result IDs are retained in JSON without source/result cascading FKs.
export const libraryBatchConsentOperations = pgTable('library_batch_consent_operations', {
  userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  operationId:uuid('operation_id').notNull(),
  requestHash:text('request_hash').notNull(),
  canonicalIntent:jsonb('canonical_intent').$type<LibraryBatchIntent>().notNull(),
  acceptedSnapshotFingerprint:text('accepted_snapshot_fingerprint').notNull(),
  receipt:jsonb('receipt').$type<LibraryBatchReceipt>().notNull(),
  createdAt,
}, table=>[primaryKey({columns:[table.userId,table.operationId]}),
  check('library_batch_request_hash_format',sql`${table.requestHash} ~ '^[a-f0-9]{64}$'`),
  check('library_batch_snapshot_hash_format',sql`${table.acceptedSnapshotFingerprint} ~ '^[a-f0-9]{64}$'`)]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  sessionVersion: integer('session_version').notNull().default(0),
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

export const userInvitations = pgTable('user_invitations', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').$type<'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'>().notNull().default('PENDING'),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
  createdAt,
}, table => [
  uniqueIndex('user_invitations_pending_email_uidx').on(table.email).where(sql`${table.status} = 'PENDING'`),
  check('user_invitations_status_check', sql`${table.status} IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')`),
  check('user_invitations_hash_format', sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`),
]);

export const socialAccounts = pgTable('social_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: socialProviderEnum('provider').notNull(),
  providerAccountId: text('provider_account_id'),
  displayName: text('display_name').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  connectionStatus: socialConnectionStatusEnum('connection_status').notNull().default('DISCONNECTED'),
  connectionGeneration: integer('connection_generation').notNull().default(0),
  bindingRevision: integer('binding_revision').notNull().default(0),
  connectionAttemptCount: integer('connection_attempt_count').notNull().default(0),
  connectionAttemptWindow: timestamp('connection_attempt_window', { withTimezone: true, mode: 'date' }),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex('social_accounts_user_provider_uidx').on(table.userId, table.provider),
  index('social_accounts_user_id_idx').on(table.userId),
]);

// Only authenticated ciphertext is stored; account/provider/purpose/version are AAD.
export const vkCredentials = pgTable('vk_credentials', {
  accountId: text('account_id').primaryKey().references(() => socialAccounts.id, { onDelete: 'cascade' }),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  tag: text('tag').notNull(),
  keyVersion: text('key_version').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  refreshState: vkRefreshStateEnum('refresh_state').notNull().default('READY'),
  updatedAt,
});

export type SocialConnectionReceipt = {
  operationId: string; accountId: string; provider: 'TELEGRAM' | 'MAX';
  destinationId: string; bindingRevision: number; state: 'VERIFIED_DISABLED';
};

// A verified grant survives logout; session epoch is evidence, not a session FK.
export const socialBindings = pgTable('social_bindings', {
  accountId: text('account_id').primaryKey().references(() => socialAccounts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: socialProviderEnum('provider').notNull(),
  destinationId: text('destination_id').notNull(),
  humanId: text('human_id').notNull(),
  botId: text('bot_id').notNull(),
  configRevision: text('config_revision').notNull(),
  sessionVersion: integer('session_version').notNull(),
  revision: integer('revision').notNull(),
  checkedAt: timestamp('checked_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt, updatedAt,
}, table => [uniqueIndex('social_bindings_provider_destination_uidx').on(table.provider, table.destinationId),
  check('social_bindings_provider_check', sql`${table.provider} IN ('TELEGRAM','MAX')`)]);

export const socialConnectionIntents = pgTable('social_connection_intents', {
  id: uuid('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull().references(() => socialAccounts.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  sessionVersion: integer('session_version').notNull(),
  provider: socialProviderEnum('provider').notNull(),
  destinationId: text('destination_id').notNull(),
  destinationName: text('destination_name').notNull(),
  generation: integer('generation').notNull(),
  bindingRevision: integer('binding_revision').notNull(),
  configRevision: text('config_revision').notNull(),
  nonceHash: text('nonce_hash').notNull(),
  ticketHash: text('ticket_hash'),
  replayDigest: text('replay_digest'),
  humanId: text('human_id'),
  humanName: text('human_name'),
  authDate: timestamp('auth_date', { withTimezone: true, mode: 'date' }),
  ticketExpiresAt: timestamp('ticket_expires_at', { withTimezone: true, mode: 'date' }),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  state: text('state').$type<'PENDING'|'CANDIDATE'|'VERIFYING'|'COMPLETED'|'CANCELLED'|'FAILED'>().notNull().default('PENDING'),
  attempts: integer('attempts').notNull().default(0),
  createdAt,
}, table => [
  uniqueIndex('social_connection_nonce_uidx').on(table.nonceHash),
  uniqueIndex('social_connection_ticket_uidx').on(table.ticketHash),
  uniqueIndex('social_connection_replay_uidx').on(table.replayDigest),
  uniqueIndex('social_connection_current_uidx').on(table.accountId).where(sql`${table.state} IN ('PENDING','CANDIDATE','VERIFYING')`),
  index('social_connection_account_created_idx').on(table.accountId,table.createdAt),
  check('social_connection_state_check',sql`${table.state} IN ('PENDING','CANDIDATE','VERIFYING','COMPLETED','CANCELLED','FAILED')`),
  check('social_connection_provider_check',sql`${table.provider} IN ('TELEGRAM','MAX')`),
]);

export const socialConnectionReceipts = pgTable('social_connection_receipts', {
  operationId: uuid('operation_id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull().references(() => socialAccounts.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull(),
  sessionVersion: integer('session_version').notNull(),
  generation: integer('generation').notNull(),
  configRevision: text('config_revision').notNull(),
  ticketHash: text('ticket_hash').notNull(),
  receipt: jsonb('receipt').$type<SocialConnectionReceipt>().notNull(),
  createdAt,
}, table => [uniqueIndex('social_connection_receipt_ticket_uidx').on(table.ticketHash)]);

// Two bounded ingress buckets, independent of login rate limits.
export const socialProofRateLimits = pgTable('social_proof_rate_limits', {
  provider: socialProviderEnum('provider').primaryKey(),
  count: integer('count').notNull(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const vkOAuthIntents = pgTable('vk_oauth_intents', {
  stateHash: text('state_hash').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull().references(() => socialAccounts.id, { onDelete: 'cascade' }),
  communityId: text('community_id').notNull(),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  tag: text('tag').notNull(),
  keyVersion: text('key_version').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt,
}, table => [uniqueIndex('vk_oauth_intents_account_uidx').on(table.accountId), index('vk_oauth_intents_expiry_idx').on(table.expiresAt)]);

export const libraryItems = pgTable('library_items', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  bodyText: text('body_text').notNull(),
  status: libraryItemStatusEnum('status').notNull().default('READY'),
  createdAt,
  updatedAt,
}, (table) => [
  index('library_items_user_id_idx').on(table.userId),
]);

// A publication pointer has its own public identity; private item IDs stay private.
export const sharedLibraryItems = pgTable('shared_library_items', {
  id: uuid('id').primaryKey(),
  sourceId: text('source_id').notNull().references(() => libraryItems.id, { onDelete: 'cascade' }),
  createdAt,
}, table => [uniqueIndex('shared_library_items_source_uidx').on(table.sourceId)]);

// Result snapshots survive source/result deletion and never reference another owner.
export const sharedLibraryCopyReceipts = pgTable('shared_library_copy_receipts', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  operationId: uuid('operation_id').notNull(),
  inputHash: text('input_hash').notNull(),
  items: jsonb('items').$type<LibraryItemDto[]>().notNull(),
  createdAt,
}, table => [primaryKey({ columns: [table.userId, table.operationId] }),
  check('shared_library_copy_hash_format', sql`${table.inputHash} ~ '^[a-f0-9]{64}$'`)]);

export const libraryCreationAttempts = pgTable('library_creation_attempts', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  creationKey: text('creation_key').notNull(),
  inputHash: text('input_hash').notNull(),
  // Deliberately retained after item deletion; no cascading item FK.
  itemId: text('item_id').notNull(),
  state: libraryCreationStateEnum('state').notNull().default('CREATED'),
  createdAt,
  updatedAt,
}, table => [
  primaryKey({ columns: [table.userId, table.creationKey] }),
  index('library_creation_attempts_owner_item_idx').on(table.userId, table.itemId),
]);

export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  baseText: text('base_text').notNull(),
  status: postStatusEnum('status').notNull().default('DRAFT'),
  creationKey: text('creation_key'),
  creationInputHash: text('creation_input_hash'),
  sourceLibraryItemId: text('source_library_item_id').references(() => libraryItems.id, { onDelete: 'set null' }),
  createdAt,
  updatedAt,
}, (table) => [
  index('posts_user_id_idx').on(table.userId),
  index('posts_status_idx').on(table.status),
  uniqueIndex('posts_user_creation_key_uidx').on(table.userId, table.creationKey),
  uniqueIndex('posts_source_library_item_uidx').on(table.sourceLibraryItemId),
]);

export const postTargets = pgTable('post_targets', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  socialAccountId: text('social_account_id').notNull().references(() => socialAccounts.id),
  textOverride: text('text_override'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' }),
  approvalCancelledAt: timestamp('approval_cancelled_at', { withTimezone: true, mode: 'date' }),
  active: boolean('active').notNull().default(true),
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

export const libraryItemMedia = pgTable('library_item_media', {
  libraryItemId: text('library_item_id').notNull().references(() => libraryItems.id, { onDelete: 'cascade' }),
  mediaId: text('media_id').notNull().references(() => mediaAssets.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
}, (table) => [
  primaryKey({ columns: [table.libraryItemId, table.mediaId] }),
  uniqueIndex('library_item_media_item_position_uidx').on(table.libraryItemId, table.position),
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
  analyticsDestinationId: text('analytics_destination_id'),
  socialBindingRevision: integer('social_binding_revision'),
  socialBindingDestinationId: text('social_binding_destination_id'),
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

export const publicationMetrics = pgTable('publication_metrics', {
  publicationId: text('publication_id').primaryKey().references(() => publications.id, {onDelete:'cascade'}),
  remoteMessageId: text('remote_message_id').notNull(),
  destinationId: text('destination_id').notNull(),
  metric: text('metric').$type<AnalyticsMetric>().notNull(),
  source: text('source').$type<'MAX_MESSAGE'|'TELEGRAM_AGGREGATE'>().notNull(),
  value: bigint('value',{mode:'number'}),
  coverage: text('coverage').$type<MetricObservation['coverage']>().notNull().default('NO_DATA'),
  observedAt: timestamp('observed_at',{withTimezone:true,mode:'date'}),
  providerEventAt: timestamp('provider_event_at',{withTimezone:true,mode:'date'}),
  lastUpdateId: bigint('last_update_id',{mode:'number'}),
  collectionError: text('collection_error').$type<AnalyticsError>(),
  attemptedAt: timestamp('attempted_at',{withTimezone:true,mode:'date'}),
  nextAttemptAt: timestamp('next_attempt_at',{withTimezone:true,mode:'date'}),
}, table=>[
  check('publication_metrics_value_check', sql`${table.value} IS NULL OR (${table.value} >= 0 AND ${table.value} <= 9007199254740991)`),
]);
// Retained safe snapshots: source/result deletion must never erase a decision.
export const swipeDecisionReceipts = pgTable('swipe_decision_receipts', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  operationId: uuid('operation_id').notNull(),
  requestHash: text('request_hash').notNull(),
  sourceId: text('source_id').notNull(),
  sourceRevision: timestamp('source_revision', {withTimezone:true,mode:'date'}).notNull(),
  contentFingerprint: text('content_fingerprint').notNull(),
  textLength: integer('text_length').notNull(),
  mediaTypes: jsonb('media_types').$type<string[]>().notNull(),
  mediaCount: integer('media_count').notNull(),
  decision: text('decision').$type<'LIKE'|'DISLIKE'>().notNull(),
  origin: text('origin').$type<'swipe-planner'>().notNull(),
  inputMethod: text('input_method').$type<'gesture'|'button'|'keyboard'>().notNull(),
  confirmedAt: timestamp('confirmed_at',{withTimezone:true,mode:'date'}).notNull(),
  providers: jsonb('providers').$type<('telegram'|'max'|'vk')[]>().notNull(),
  scheduledAt: timestamp('scheduled_at',{withTimezone:true,mode:'date'}),
  resultPostId: text('result_post_id'),
}, table=>[primaryKey({columns:[table.userId,table.operationId]}),index('swipe_receipts_owner_source_idx').on(table.userId,table.sourceId)]);
export const swipeCurrentFeedback = pgTable('swipe_current_feedback', {
  userId: text('user_id').notNull().references(() => users.id,{onDelete:'cascade'}),
  sourceId: text('source_id').notNull(),
  operationId: uuid('operation_id').notNull(),
},table=>[primaryKey({columns:[table.userId,table.sourceId]})]);

// Source and result IDs intentionally have no cascading foreign keys: deletion
// remains a terminal historical result, never permission to create it again.
export const sharedFeedDecisions=pgTable('shared_feed_decisions',{
 userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 operationId:uuid('operation_id').notNull(),
 inputHash:text('input_hash').notNull(),
 shareId:uuid('share_id').notNull(),
 sourceRevision:timestamp('source_revision',{withTimezone:true,mode:'date'}).notNull(),
 decision:text('decision').$type<'LIKE'|'DISLIKE'>().notNull(),
 personalItemId:text('personal_item_id'),
 postId:text('post_id'),
 scheduledAt:timestamp('scheduled_at',{withTimezone:true,mode:'date'}),
 createdAt:timestamp('created_at',{withTimezone:true,mode:'date'}).notNull().defaultNow(),
},table=>[
 primaryKey({columns:[table.userId,table.operationId]}),
 uniqueIndex('shared_feed_owner_source_revision_uq').on(table.userId,table.shareId,table.sourceRevision),
 check('shared_feed_result_shape',sql`(${table.decision}='DISLIKE' AND ${table.personalItemId} IS NULL AND ${table.postId} IS NULL AND ${table.scheduledAt} IS NULL) OR (${table.decision}='LIKE' AND ${table.personalItemId} IS NOT NULL AND ${table.postId} IS NOT NULL AND ${table.scheduledAt} IS NOT NULL)`),
]);
