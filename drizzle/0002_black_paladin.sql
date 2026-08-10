UPDATE `users` SET `role` = 'sales_manager' WHERE `role` = 'manager';
--> statement-breakpoint
UPDATE `users` SET `role` = 'sales' WHERE `role` = 'agent';
--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`distributor_user_id` text NOT NULL,
	`island` text NOT NULL,
	`status` text DEFAULT 'assigned' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'copie' NOT NULL,
	`scheduled_for` text,
	`delivery_contact_name` text NOT NULL,
	`delivery_contact_email` text NOT NULL,
	`delivery_contact_phone` text,
	`delivery_address` text,
	`notes` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`distributor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `deliveries_distributor_idx` ON `deliveries` (`distributor_user_id`);--> statement-breakpoint
CREATE INDEX `deliveries_island_idx` ON `deliveries` (`island`);--> statement-breakpoint
CREATE INDEX `deliveries_status_idx` ON `deliveries` (`status`);--> statement-breakpoint
CREATE INDEX `deliveries_client_idx` ON `deliveries` (`client_id`);
