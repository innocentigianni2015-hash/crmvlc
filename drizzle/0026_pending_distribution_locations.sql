-- Allow administrators to import delivery photos before the exact address and
-- map pin are known. Pending points stay off the public map and remain assigned
-- to the selected distributor until their location is completed.
ALTER TABLE `distribution_points` ADD `area` text;
--> statement-breakpoint
ALTER TABLE `distribution_points` ADD `location_status` text DEFAULT 'complete' NOT NULL;
--> statement-breakpoint
ALTER TABLE `distribution_points` ADD `assigned_distributor_user_id` text REFERENCES `users`(`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `distribution_points_location_status_idx` ON `distribution_points` (`location_status`, `island`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `distribution_points_assigned_distributor_idx` ON `distribution_points` (`assigned_distributor_user_id`, `location_status`);
