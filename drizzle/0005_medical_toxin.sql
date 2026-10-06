CREATE TYPE "public"."library_creation_state" AS ENUM('CREATED', 'DELETED');--> statement-breakpoint
CREATE TABLE "library_creation_attempts" (
	"user_id" text NOT NULL,
	"creation_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"item_id" text NOT NULL,
	"state" "library_creation_state" DEFAULT 'CREATED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_creation_attempts_user_id_creation_key_pk" PRIMARY KEY("user_id","creation_key")
);
--> statement-breakpoint
ALTER TABLE "library_creation_attempts" ADD CONSTRAINT "library_creation_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_creation_attempts_owner_item_idx" ON "library_creation_attempts" USING btree ("user_id","item_id");