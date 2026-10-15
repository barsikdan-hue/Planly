CREATE TABLE "user_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "user_invitations_status_check" CHECK ("user_invitations"."status" IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
	CONSTRAINT "user_invitations_hash_format" CHECK ("user_invitations"."token_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_invitations_pending_email_uidx" ON "user_invitations" USING btree ("email") WHERE "user_invitations"."status" = 'PENDING';