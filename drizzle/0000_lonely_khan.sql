CREATE TYPE "public"."media_source" AS ENUM('UPLOAD', 'AI_GENERATED');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('DRAFT', 'READY', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."publication_error_type" AS ENUM('TEMPORARY', 'AUTH', 'VALIDATION', 'PERMANENT');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('SCHEDULED', 'QUEUED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED', 'REQUIRES_RECONNECT');--> statement-breakpoint
CREATE TYPE "public"."social_connection_status" AS ENUM('DISCONNECTED', 'CONNECTED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."social_provider" AS ENUM('TELEGRAM', 'MAX');--> statement-breakpoint
CREATE TABLE "login_rate_limits" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"source" "media_source" DEFAULT 'UPLOAD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "post_media" (
	"post_id" text NOT NULL,
	"media_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "post_media_post_id_media_id_pk" PRIMARY KEY("post_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "post_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"social_account_id" text NOT NULL,
	"text_override" text,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"base_text" text NOT NULL,
	"status" "post_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"post_id" text NOT NULL,
	"post_target_id" text NOT NULL,
	"provider" "social_provider" NOT NULL,
	"status" "publication_status" DEFAULT 'SCHEDULED' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"provider_remote_id" text,
	"provider_url" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"normalized_error_type" "publication_error_type",
	"provider_error_code" text,
	"provider_error_message" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publications_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" "social_provider" NOT NULL,
	"provider_account_id" text,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"connection_status" "social_connection_status" DEFAULT 'DISCONNECTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_post_target_id_post_targets_id_fk" FOREIGN KEY ("post_target_id") REFERENCES "public"."post_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_user_id_idx" ON "media_assets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_media_post_position_uidx" ON "post_media" USING btree ("post_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "post_targets_post_account_uidx" ON "post_targets" USING btree ("post_id","social_account_id");--> statement-breakpoint
CREATE INDEX "post_targets_scheduled_at_idx" ON "post_targets" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "posts_user_id_idx" ON "posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "posts_status_idx" ON "posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "publications_user_id_idx" ON "publications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "publications_status_idx" ON "publications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "publications_scheduled_at_idx" ON "publications" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_accounts_user_provider_uidx" ON "social_accounts" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "social_accounts_user_id_idx" ON "social_accounts" USING btree ("user_id");