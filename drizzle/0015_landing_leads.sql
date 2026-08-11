CREATE TABLE IF NOT EXISTS `landing_leads` (
  `id` text PRIMARY KEY NOT NULL,
  `company` text NOT NULL,
  `contact` text NOT NULL,
  `phone` text NOT NULL,
  `email` text NOT NULL,
  `city` text NOT NULL,
  `island` text NOT NULL,
  `service` text NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `locale` text DEFAULT 'it' NOT NULL,
  `source` text DEFAULT 'crmvlc_landing' NOT NULL,
  `status` text DEFAULT 'pending_manager' NOT NULL,
  `assigned_manager_id` text,
  `client_id` text,
  `consent_at` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`assigned_manager_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `landing_leads_island_status_idx` ON `landing_leads` (`island`,`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `landing_leads_manager_idx` ON `landing_leads` (`assigned_manager_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `landing_leads_email_idx` ON `landing_leads` (`email`,`created_at`);
