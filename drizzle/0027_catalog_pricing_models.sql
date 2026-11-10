ALTER TABLE `price_items` ADD COLUMN `item_type` text DEFAULT 'ad_space' NOT NULL;--> statement-breakpoint
ALTER TABLE `price_items` ADD COLUMN `pricing_model` text DEFAULT 'per_issue' NOT NULL;--> statement-breakpoint
ALTER TABLE `quote_items` ADD COLUMN `pricing_model` text DEFAULT 'per_issue' NOT NULL;
