CREATE TABLE "library_batch_consent_operations" (
	"user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"canonical_intent" jsonb NOT NULL,
	"accepted_snapshot_fingerprint" text NOT NULL,
	"receipt" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_batch_consent_operations_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id"),
	CONSTRAINT "library_batch_request_hash_format" CHECK ("library_batch_consent_operations"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "library_batch_snapshot_hash_format" CHECK ("library_batch_consent_operations"."accepted_snapshot_fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "library_batch_consent_operations" ADD CONSTRAINT "library_batch_consent_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;