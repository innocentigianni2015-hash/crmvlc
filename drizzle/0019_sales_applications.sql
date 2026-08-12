CREATE TABLE IF NOT EXISTS `sales_applications` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `phone` text NOT NULL,
  `city` text NOT NULL,
  `island` text NOT NULL,
  `languages` text NOT NULL,
  `availability` text NOT NULL,
  `presentation` text NOT NULL,
  `collaboration_type` text DEFAULT 'commission' NOT NULL,
  `locale` text DEFAULT 'it' NOT NULL,
  `status` text DEFAULT 'new' NOT NULL,
  `admin_notes` text DEFAULT '' NOT NULL,
  `consent_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `reviewed_by` text,
  `reviewed_at` text,
  FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sales_applications_status_created_idx` ON `sales_applications` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sales_applications_island_status_idx` ON `sales_applications` (`island`,`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sales_applications_email_created_idx` ON `sales_applications` (`email`,`created_at`);
