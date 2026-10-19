ALTER TABLE `vip_members` ADD `created_by_user_id` text REFERENCES `users`(`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vip_members_created_by_idx` ON `vip_members` (`created_by_user_id`);
