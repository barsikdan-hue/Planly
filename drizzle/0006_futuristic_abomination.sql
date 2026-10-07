CREATE TYPE "public"."vk_refresh_state" AS ENUM('READY', 'UNCERTAIN');--> statement-breakpoint
ALTER TYPE "public"."social_provider" ADD VALUE 'VK';--> statement-breakpoint
CREATE TABLE "vk_credentials" (
	"account_id" text PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"key_version" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"refresh_state" "vk_refresh_state" DEFAULT 'READY' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vk_oauth_intents" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"community_id" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"key_version" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vk_credentials" ADD CONSTRAINT "vk_credentials_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vk_oauth_intents" ADD CONSTRAINT "vk_oauth_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vk_oauth_intents" ADD CONSTRAINT "vk_oauth_intents_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vk_oauth_intents_account_uidx" ON "vk_oauth_intents" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "vk_oauth_intents_expiry_idx" ON "vk_oauth_intents" USING btree ("expires_at");