-- Stop before any schema/data change if legacy rows already collide. No winner,
-- deletion or human-verified backfill is inferred from legacy bot-only status.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM social_accounts
    WHERE provider IN ('TELEGRAM','MAX') AND provider_account_id IS NOT NULL
    GROUP BY provider, CASE
      WHEN trim(provider_account_id) ~ '^-?[0-9]+$' THEN (trim(provider_account_id)::numeric)::text
      ELSE lower(trim(provider_account_id)) END
    HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'SOCIAL_CONNECTION_LEGACY_DUPLICATES: owner preflight required';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "social_bindings" (
	"account_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" "social_provider" NOT NULL,
	"destination_id" text NOT NULL,
	"human_id" text NOT NULL,
	"bot_id" text NOT NULL,
	"config_revision" text NOT NULL,
	"session_version" integer NOT NULL,
	"revision" integer NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_bindings_provider_check" CHECK ("social_bindings"."provider" IN ('TELEGRAM','MAX'))
);
--> statement-breakpoint
CREATE TABLE "social_connection_intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"session_id" text NOT NULL,
	"session_version" integer NOT NULL,
	"provider" "social_provider" NOT NULL,
	"destination_id" text NOT NULL,
	"destination_name" text NOT NULL,
	"generation" integer NOT NULL,
	"binding_revision" integer NOT NULL,
	"config_revision" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"ticket_hash" text,
	"replay_digest" text,
	"human_id" text,
	"human_name" text,
	"auth_date" timestamp with time zone,
	"ticket_expires_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_connection_state_check" CHECK ("social_connection_intents"."state" IN ('PENDING','CANDIDATE','VERIFYING','COMPLETED','CANCELLED','FAILED')),
	CONSTRAINT "social_connection_provider_check" CHECK ("social_connection_intents"."provider" IN ('TELEGRAM','MAX'))
);
--> statement-breakpoint
CREATE TABLE "social_connection_receipts" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"session_id" text NOT NULL,
	"session_version" integer NOT NULL,
	"generation" integer NOT NULL,
	"config_revision" text NOT NULL,
	"ticket_hash" text NOT NULL,
	"receipt" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_proof_rate_limits" (
	"provider" "social_provider" PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "social_binding_revision" integer;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "social_binding_destination_id" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "connection_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "binding_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "connection_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "connection_attempt_window" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_bindings" ADD CONSTRAINT "social_bindings_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_bindings" ADD CONSTRAINT "social_bindings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connection_intents" ADD CONSTRAINT "social_connection_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connection_intents" ADD CONSTRAINT "social_connection_intents_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connection_intents" ADD CONSTRAINT "social_connection_intents_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connection_receipts" ADD CONSTRAINT "social_connection_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connection_receipts" ADD CONSTRAINT "social_connection_receipts_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_bindings_provider_destination_uidx" ON "social_bindings" USING btree ("provider","destination_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_connection_nonce_uidx" ON "social_connection_intents" USING btree ("nonce_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "social_connection_ticket_uidx" ON "social_connection_intents" USING btree ("ticket_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "social_connection_replay_uidx" ON "social_connection_intents" USING btree ("replay_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "social_connection_current_uidx" ON "social_connection_intents" USING btree ("account_id") WHERE "social_connection_intents"."state" IN ('PENDING','CANDIDATE','VERIFYING');--> statement-breakpoint
CREATE INDEX "social_connection_account_created_idx" ON "social_connection_intents" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_connection_receipt_ticket_uidx" ON "social_connection_receipts" USING btree ("ticket_hash");
