CREATE TABLE `discount_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`discount_bps` integer NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`deactivated_at` text,
	`deactivated_by` text,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deactivated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `discount_campaigns_validity_idx` ON `discount_campaigns` (`active`,`starts_on`,`ends_on`);
--> statement-breakpoint
CREATE INDEX `discount_campaigns_created_idx` ON `discount_campaigns` (`created_at`);
--> statement-breakpoint
ALTER TABLE `quotes` ADD `discount_campaign_id` text REFERENCES discount_campaigns(id);
--> statement-breakpoint
CREATE INDEX `quotes_discount_campaign_idx` ON `quotes` (`discount_campaign_id`);
--> statement-breakpoint
CREATE TABLE `podcast_appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`guest_name` text NOT NULL,
	`topic` text NOT NULL,
	`interviewer_user_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`interviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `podcast_appointments_interviewer_idx` ON `podcast_appointments` (`interviewer_user_id`,`starts_at`,`ends_at`);
--> statement-breakpoint
CREATE INDEX `podcast_appointments_calendar_idx` ON `podcast_appointments` (`status`,`starts_at`);
