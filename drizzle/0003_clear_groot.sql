ALTER TABLE "posts" ADD COLUMN "creation_key" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "creation_input_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_user_creation_key_uidx" ON "posts" USING btree ("user_id","creation_key");