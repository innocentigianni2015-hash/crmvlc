ALTER TABLE `price_items` ADD COLUMN `giftable` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `quote_items` ADD COLUMN `complimentary` integer DEFAULT 0 NOT NULL;
