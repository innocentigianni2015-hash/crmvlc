CREATE TABLE `ad_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_label` text NOT NULL,
	`island` text NOT NULL,
	`slot_code` text NOT NULL,
	`slot_name` text NOT NULL,
	`width_mm` integer NOT NULL,
	`height_mm` integer NOT NULL,
	`price_item_id` text,
	`status` text DEFAULT 'available' NOT NULL,
	`client_id` text,
	`contract_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`price_item_id`) REFERENCES `price_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ad_inventory_issue_slot_unique` ON `ad_inventory` (`issue_label`,`island`,`slot_code`);--> statement-breakpoint
CREATE INDEX `ad_inventory_status_idx` ON `ad_inventory` (`island`,`status`);--> statement-breakpoint
CREATE TABLE `bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`monthly_price_cents` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bundles_code_unique` ON `bundles` (`code`);--> statement-breakpoint
CREATE TABLE `commission_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`island` text,
	`rate_bps` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `commission_rules_scope_idx` ON `commission_rules` (`role`,`island`,`active`);--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`sponsor_id` text NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`issued_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`redeemed_at` text,
	`redeemed_by_user_id` text,
	`latitude_e6` integer,
	`longitude_e6` integer,
	FOREIGN KEY (`member_id`) REFERENCES `vip_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`redeemed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_unique` ON `coupons` (`code`);--> statement-breakpoint
CREATE INDEX `coupons_sponsor_idx` ON `coupons` (`sponsor_id`,`status`);--> statement-breakpoint
CREATE INDEX `coupons_member_idx` ON `coupons` (`member_id`);--> statement-breakpoint
CREATE TABLE `distribution_points` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`name` text NOT NULL,
	`island` text NOT NULL,
	`address` text NOT NULL,
	`latitude_e6` integer NOT NULL,
	`longitude_e6` integer NOT NULL,
	`capacity` integer DEFAULT 0 NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`public_visible` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `distribution_points_island_idx` ON `distribution_points` (`island`,`public_visible`);--> statement-breakpoint
CREATE TABLE `payout_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`note` text,
	`reviewed_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payout_requests_user_idx` ON `payout_requests` (`user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `photo_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_id` text NOT NULL,
	`distributor_user_id` text NOT NULL,
	`island` text NOT NULL,
	`r2_key` text NOT NULL,
	`sha256` text NOT NULL,
	`latitude_e6` integer NOT NULL,
	`longitude_e6` integer NOT NULL,
	`geofence_distance_m` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`quality_score` integer DEFAULT 0 NOT NULL,
	`watermark_text` text NOT NULL,
	`reviewed_by` text,
	`created_at` text NOT NULL,
	`reviewed_at` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`distributor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `photo_audits_delivery_idx` ON `photo_audits` (`delivery_id`);--> statement-breakpoint
CREATE INDEX `photo_audits_scope_idx` ON `photo_audits` (`island`,`status`);--> statement-breakpoint
CREATE TABLE `sales_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`island` text NOT NULL,
	`latitude_e6` integer NOT NULL,
	`longitude_e6` integer NOT NULL,
	`checked_in_at` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_checkins_user_idx` ON `sales_checkins` (`user_id`,`checked_in_at`);--> statement-breakpoint
CREATE INDEX `sales_checkins_island_idx` ON `sales_checkins` (`island`,`checked_in_at`);--> statement-breakpoint
CREATE TABLE `sales_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text,
	`island` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`scheduled_for` text NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_tasks_user_idx` ON `sales_tasks` (`user_id`,`status`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `sales_tasks_island_idx` ON `sales_tasks` (`island`,`status`);--> statement-breakpoint
CREATE TABLE `sponsors` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`name` text NOT NULL,
	`island` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`offer_title` text NOT NULL,
	`discount_text` text NOT NULL,
	`address` text,
	`latitude_e6` integer,
	`longitude_e6` integer,
	`instagram_handle` text,
	`owner_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sponsors_island_idx` ON `sponsors` (`island`);--> statement-breakpoint
CREATE INDEX `sponsors_owner_idx` ON `sponsors` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `vip_members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`island` text NOT NULL,
	`tier` text DEFAULT 'standard' NOT NULL,
	`streak_months` integer DEFAULT 0 NOT NULL,
	`consent_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vip_members_phone_unique` ON `vip_members` (`phone`);--> statement-breakpoint
CREATE INDEX `vip_members_island_idx` ON `vip_members` (`island`);--> statement-breakpoint
CREATE TABLE `wallet_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`available_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wallet_entries_user_idx` ON `wallet_entries` (`user_id`,`status`,`created_at`);
--> statement-breakpoint
INSERT INTO `bundles` (`id`, `code`, `name`, `description`, `monthly_price_cents`, `active`, `created_at`, `updated_at`) VALUES
  ('bundle-entry', 'ENTRY', 'Entry', 'Presenza essenziale su magazine e directory VIP.', 14900, 1, '2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z'),
  ('bundle-business', 'BUSINESS', 'Business', 'Visibilità continuativa, coupon e report mensile.', 29900, 1, '2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z'),
  ('bundle-vip', 'VIP', 'VIP', 'Posizionamento premium, campagne e priorità editoriale.', 59900, 1, '2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z');
