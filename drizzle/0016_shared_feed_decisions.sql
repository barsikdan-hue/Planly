CREATE TABLE "shared_feed_decisions" (
	"user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"share_id" uuid NOT NULL,
	"source_revision" timestamp with time zone NOT NULL,
	"decision" text NOT NULL,
	"personal_item_id" text,
	"post_id" text,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_feed_decisions_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id"),
	CONSTRAINT "shared_feed_result_shape" CHECK (("shared_feed_decisions"."decision"='DISLIKE' AND "shared_feed_decisions"."personal_item_id" IS NULL AND "shared_feed_decisions"."post_id" IS NULL AND "shared_feed_decisions"."scheduled_at" IS NULL) OR ("shared_feed_decisions"."decision"='LIKE' AND "shared_feed_decisions"."personal_item_id" IS NOT NULL AND "shared_feed_decisions"."post_id" IS NOT NULL AND "shared_feed_decisions"."scheduled_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "shared_feed_decisions" ADD CONSTRAINT "shared_feed_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shared_feed_owner_source_revision_uq" ON "shared_feed_decisions" USING btree ("user_id","share_id","source_revision");