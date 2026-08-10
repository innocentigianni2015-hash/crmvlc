CREATE TABLE `quote_counters` (
	`year` integer PRIMARY KEY NOT NULL,
	`next_number` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quote_items` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`price_item_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`dimensions` text NOT NULL,
	`monthly_price_cents` integer NOT NULL,
	`quantity` integer NOT NULL,
	`months` integer NOT NULL,
	`line_subtotal_cents` integer NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`price_item_id`) REFERENCES `price_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quote_items_quote_idx` ON `quote_items` (`quote_id`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_number` text NOT NULL,
	`sequence` integer NOT NULL,
	`year` integer NOT NULL,
	`client_id` text NOT NULL,
	`price_list_id` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`owner_user_id` text NOT NULL,
	`island` text NOT NULL,
	`customer_company` text NOT NULL,
	`customer_contact` text NOT NULL,
	`customer_email` text NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`tax_name` text DEFAULT 'IGIC' NOT NULL,
	`tax_rate_bps` integer DEFAULT 700 NOT NULL,
	`months` integer NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`discount_bps` integer DEFAULT 0 NOT NULL,
	`discount_reason` text,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`net_cents` integer NOT NULL,
	`tax_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`customer_note` text,
	`valid_until` text NOT NULL,
	`pdf_r2_key` text NOT NULL,
	`pdf_sha256` text NOT NULL,
	`converted_contract_id` text,
	`converted_at` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_number_unique` ON `quotes` (`quote_number`);--> statement-breakpoint
CREATE INDEX `quotes_owner_idx` ON `quotes` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `quotes_island_idx` ON `quotes` (`island`);--> statement-breakpoint
CREATE INDEX `quotes_client_idx` ON `quotes` (`client_id`);--> statement-breakpoint
CREATE INDEX `quotes_status_idx` ON `quotes` (`status`);--> statement-breakpoint
CREATE INDEX `quotes_created_idx` ON `quotes` (`created_at`);--> statement-breakpoint
ALTER TABLE `contracts` ADD `quote_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `contracts_quote_unique` ON `contracts` (`quote_id`);--> statement-breakpoint
CREATE TRIGGER `quotes_no_delete`
BEFORE DELETE ON `quotes`
BEGIN
  SELECT RAISE(ABORT, 'quotes are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `quotes_commercial_data_immutable`
BEFORE UPDATE OF `quote_number`, `sequence`, `year`, `client_id`, `price_list_id`, `owner_user_id`, `island`, `customer_company`, `customer_contact`, `customer_email`, `currency`, `tax_name`, `tax_rate_bps`, `months`, `subtotal_cents`, `discount_bps`, `discount_reason`, `discount_cents`, `net_cents`, `tax_cents`, `total_cents`, `customer_note`, `valid_until`, `pdf_r2_key`, `pdf_sha256`, `created_by`, `created_at`
ON `quotes`
BEGIN
  SELECT RAISE(ABORT, 'issued quote content is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `quotes_status_transition`
BEFORE UPDATE OF `status` ON `quotes`
WHEN NEW.`status` <> OLD.`status` AND NOT (OLD.`status` = 'issued' AND NEW.`status` = 'converted')
BEGIN
  SELECT RAISE(ABORT, 'invalid quote status transition');
END;
--> statement-breakpoint
CREATE TRIGGER `quotes_conversion_evidence`
BEFORE UPDATE OF `converted_contract_id`, `converted_at` ON `quotes`
WHEN NOT (OLD.`status` = 'issued' AND NEW.`status` = 'converted' AND NEW.`converted_contract_id` IS NOT NULL AND NEW.`converted_at` IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'invalid quote conversion evidence');
END;
--> statement-breakpoint
CREATE TRIGGER `quote_items_no_update`
BEFORE UPDATE ON `quote_items`
BEGIN
  SELECT RAISE(ABORT, 'quote items are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `quote_items_no_delete`
BEFORE DELETE ON `quote_items`
BEGIN
  SELECT RAISE(ABORT, 'quote items are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `contracts_quote_link_valid`
BEFORE INSERT ON `contracts`
WHEN NEW.`quote_id` IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM `quotes`
  WHERE `id` = NEW.`quote_id`
    AND `status` = 'converted'
    AND `converted_contract_id` = NEW.`id`
)
BEGIN
  SELECT RAISE(ABORT, 'contract quote link is invalid');
END;
