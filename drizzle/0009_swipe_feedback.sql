CREATE TABLE "swipe_current_feedback" (
	"user_id" text NOT NULL,
	"source_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	CONSTRAINT "swipe_current_feedback_user_id_source_id_pk" PRIMARY KEY("user_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "swipe_decision_receipts" (
	"user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"source_id" text NOT NULL,
	"source_revision" timestamp with time zone NOT NULL,
	"content_fingerprint" text NOT NULL,
	"text_length" integer NOT NULL,
	"media_types" jsonb NOT NULL,
	"media_count" integer NOT NULL,
	"decision" text NOT NULL,
	"origin" text NOT NULL,
	"input_method" text NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"providers" jsonb NOT NULL,
	"scheduled_at" timestamp with time zone,
	"result_post_id" text,
	CONSTRAINT "swipe_decision_receipts_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id")
);
--> statement-breakpoint
ALTER TABLE "swipe_current_feedback" ADD CONSTRAINT "swipe_current_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipe_decision_receipts" ADD CONSTRAINT "swipe_decision_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "swipe_receipts_owner_source_idx" ON "swipe_decision_receipts" USING btree ("user_id","source_id");