ALTER TABLE `users` ADD `sales_manager_id` text REFERENCES users(id);
--> statement-breakpoint
CREATE INDEX `users_sales_manager_idx` ON `users` (`sales_manager_id`);
