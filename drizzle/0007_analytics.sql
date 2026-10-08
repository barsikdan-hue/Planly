CREATE TABLE "publication_metrics" (
	"publication_id" text PRIMARY KEY NOT NULL,
	"remote_message_id" text NOT NULL,
	"destination_id" text NOT NULL,
	"metric" text NOT NULL,
	"source" text NOT NULL,
	"value" bigint,
	"coverage" text DEFAULT 'NO_DATA' NOT NULL,
	"observed_at" timestamp with time zone,
	"provider_event_at" timestamp with time zone,
	"last_update_id" bigint,
	"collection_error" text,
	"attempted_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	CONSTRAINT "publication_metrics_value_check" CHECK ("publication_metrics"."value" IS NULL OR ("publication_metrics"."value" >= 0 AND "publication_metrics"."value" <= 9007199254740991))
);
--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "analytics_destination_id" text;--> statement-breakpoint
ALTER TABLE "publication_metrics" ADD CONSTRAINT "publication_metrics_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;