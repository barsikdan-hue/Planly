CREATE TABLE "shared_library_copy_receipts" (
	"user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"items" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_library_copy_receipts_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id"),
	CONSTRAINT "shared_library_copy_hash_format" CHECK ("shared_library_copy_receipts"."input_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "shared_library_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_library_copy_receipts" ADD CONSTRAINT "shared_library_copy_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_library_items" ADD CONSTRAINT "shared_library_items_source_id_library_items_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shared_library_items_source_uidx" ON "shared_library_items" USING btree ("source_id");