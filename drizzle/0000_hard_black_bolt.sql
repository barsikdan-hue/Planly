CREATE TABLE `accounts` (
	`owner` text NOT NULL,
	`network` text NOT NULL,
	`target` text NOT NULL,
	`label` text NOT NULL,
	`secret` text NOT NULL,
	PRIMARY KEY(`owner`, `network`)
);
--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`owner` text NOT NULL,
	`network` text NOT NULL,
	`status` text NOT NULL,
	`due` text NOT NULL,
	`started` text,
	`remote_id` text,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_deliveries_due` ON `deliveries` (`status`,`due`);--> statement-breakpoint
CREATE INDEX `idx_deliveries_post` ON `deliveries` (`post_id`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_media_owner` ON `media` (`owner`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`networks` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`media_id` text,
	`public_url` text,
	`created` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_posts_owner_date` ON `posts` (`owner`,`date`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`owner` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL
);
