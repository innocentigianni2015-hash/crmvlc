ALTER TABLE `podcast_appointments` ADD `package_code` text DEFAULT 'one_minute_free' NOT NULL;
--> statement-breakpoint
ALTER TABLE `podcast_appointments` ADD `package_name` text DEFAULT '1 minuto · 1 telecamera' NOT NULL;
--> statement-breakpoint
ALTER TABLE `podcast_appointments` ADD `package_price_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `podcast_appointments` ADD `marcolifestyle_add_on` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `podcast_appointments` ADD `marcolifestyle_price_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `podcast_appointments` ADD `subtotal_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `podcast_appointments` ADD `tax_name` text DEFAULT 'IGIC' NOT NULL;
--> statement-breakpoint
ALTER TABLE `podcast_appointments` ADD `tax_rate_bps` integer DEFAULT 700 NOT NULL;
--> statement-breakpoint
ALTER TABLE `podcast_appointments` ADD `tax_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `podcast_appointments` ADD `total_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `users`
SET `email` = 'marcolifestyle.official@gmail.com',
    `role` = 'admin',
    `island` = NULL,
    `sales_manager_id` = NULL,
    `updated_at` = CURRENT_TIMESTAMP
WHERE lower(`email`) = 'innocentigianni2015@gmail.com';
--> statement-breakpoint
DELETE FROM `sessions`
WHERE `user_id` IN (SELECT `id` FROM `users` WHERE lower(`email`) = 'marcolifestyle.official@gmail.com');
--> statement-breakpoint
DELETE FROM `auth_flow_tokens`
WHERE `user_id` IN (SELECT `id` FROM `users` WHERE lower(`email`) = 'marcolifestyle.official@gmail.com');
--> statement-breakpoint
DELETE FROM `auth_challenges`
WHERE lower(`email`) IN ('innocentigianni2015@gmail.com', 'marcolifestyle.official@gmail.com')
  AND `consumed_at` IS NULL;
