CREATE TYPE "public"."library_item_status" AS ENUM('READY', 'USED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "library_item_media" (
	"library_item_id" text NOT NULL,
	"media_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "library_item_media_library_item_id_media_id_pk" PRIMARY KEY("library_item_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "library_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"body_text" text NOT NULL,
	"status" "library_item_status" DEFAULT 'READY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "source_library_item_id" text;--> statement-breakpoint
ALTER TABLE "library_item_media" ADD CONSTRAINT "library_item_media_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_item_media" ADD CONSTRAINT "library_item_media_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "library_item_media_item_position_uidx" ON "library_item_media" USING btree ("library_item_id","position");--> statement-breakpoint
CREATE INDEX "library_items_user_id_idx" ON "library_items" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_source_library_item_id_library_items_id_fk" FOREIGN KEY ("source_library_item_id") REFERENCES "public"."library_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_source_library_item_uidx" ON "posts" USING btree ("source_library_item_id");