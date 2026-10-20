-- Allow a distributor to self-register a brand-new sales point (no client
-- link required) and track a leave/return-to-count cycle with a due-date
-- reminder, per the "Registra consegne libere" workflow extension.

-- 1. Relax deliveries.client_id / delivery_contact_name / delivery_contact_email
--    to nullable: a self-registered point has no backing client record, so
--    the first drop at it cannot populate those from a clients join.
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`distributor_user_id` text NOT NULL,
	`island` text NOT NULL,
	`status` text DEFAULT 'assigned' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'copie' NOT NULL,
	`scheduled_for` text,
	`delivery_contact_name` text,
	`delivery_contact_email` text,
	`delivery_contact_phone` text,
	`delivery_address` text,
	`notes` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`distribution_point_id` text,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`distributor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`distribution_point_id`) REFERENCES `distribution_points`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_deliveries` (
	`id`, `client_id`, `distributor_user_id`, `island`, `status`, `quantity`, `unit`,
	`scheduled_for`, `delivery_contact_name`, `delivery_contact_email`, `delivery_contact_phone`,
	`delivery_address`, `notes`, `version`, `created_by`, `completed_at`, `created_at`, `updated_at`,
	`distribution_point_id`
)
SELECT
	`id`, `client_id`, `distributor_user_id`, `island`, `status`, `quantity`, `unit`,
	`scheduled_for`, `delivery_contact_name`, `delivery_contact_email`, `delivery_contact_phone`,
	`delivery_address`, `notes`, `version`, `created_by`, `completed_at`, `created_at`, `updated_at`,
	`distribution_point_id`
FROM `deliveries`;
--> statement-breakpoint
DROP TABLE `deliveries`;
--> statement-breakpoint
ALTER TABLE `__new_deliveries` RENAME TO `deliveries`;
--> statement-breakpoint
CREATE INDEX `deliveries_distributor_idx` ON `deliveries` (`distributor_user_id`);
--> statement-breakpoint
CREATE INDEX `deliveries_island_idx` ON `deliveries` (`island`);
--> statement-breakpoint
CREATE INDEX `deliveries_status_idx` ON `deliveries` (`status`);
--> statement-breakpoint
CREATE INDEX `deliveries_client_idx` ON `deliveries` (`client_id`);
--> statement-breakpoint
CREATE INDEX `deliveries_distribution_point_idx` ON `deliveries` (`distribution_point_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint

-- 2. Let a distribution point be self-registered by a distributor, carry a
--    photo of the spot itself, and track when it's next due a count-check.
ALTER TABLE `distribution_points` ADD `created_by` text REFERENCES `users`(`id`);
--> statement-breakpoint
ALTER TABLE `distribution_points` ADD `self_registered` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `distribution_points` ADD `point_photo_r2_key` text;
--> statement-breakpoint
ALTER TABLE `distribution_points` ADD `next_check_due_at` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `distribution_points_created_by_idx` ON `distribution_points` (`created_by`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `distribution_points_next_check_due_idx` ON `distribution_points` (`next_check_due_at`);
--> statement-breakpoint

-- 3. Record each "return and count what's left" visit against a point/delivery,
--    so the CRM can compute how many copies were taken and flag overdue checks.
CREATE TABLE `delivery_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`distribution_point_id` text NOT NULL,
	`delivery_id` text,
	`distributor_user_id` text NOT NULL,
	`island` text NOT NULL,
	`quantity_left` integer NOT NULL,
	`quantity_found` integer NOT NULL,
	`quantity_taken` integer NOT NULL,
	`r2_key` text NOT NULL,
	`latitude_e6` integer NOT NULL,
	`longitude_e6` integer NOT NULL,
	`geofence_distance_m` integer,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`distribution_point_id`) REFERENCES `distribution_points`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`distributor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `delivery_checks_point_idx` ON `delivery_checks` (`distribution_point_id`);
--> statement-breakpoint
CREATE INDEX `delivery_checks_distributor_idx` ON `delivery_checks` (`distributor_user_id`);
--> statement-breakpoint
CREATE INDEX `delivery_checks_delivery_idx` ON `delivery_checks` (`delivery_id`);
