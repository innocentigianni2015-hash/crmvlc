CREATE TABLE `public_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `public_rate_limits_expiry_idx` ON `public_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `vip_events` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text,
	`sponsor_id` text,
	`event_type` text NOT NULL,
	`island` text,
	`visitor_hash` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `vip_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vip_events_sponsor_idx` ON `vip_events` (`sponsor_id`,`event_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `vip_events_member_idx` ON `vip_events` (`member_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `coupons` ADD `whatsapp_sent_at` text;--> statement-breakpoint
ALTER TABLE `coupons` ADD `whatsapp_message_id` text;