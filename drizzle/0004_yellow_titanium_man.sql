CREATE TABLE `price_items` (
	`id` text PRIMARY KEY NOT NULL,
	`price_list_id` text NOT NULL,
	`code` text NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`dimensions` text NOT NULL,
	`monthly_price_cents` integer NOT NULL,
	`included_services` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_items_code_unique` ON `price_items` (`code`);--> statement-breakpoint
CREATE INDEX `price_items_list_idx` ON `price_items` (`price_list_id`,`active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `price_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`tax_name` text DEFAULT 'IGIC' NOT NULL,
	`tax_rate_bps` integer DEFAULT 700 NOT NULL,
	`prices_include_tax` integer DEFAULT false NOT NULL,
	`valid_from` text,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `price_lists_active_idx` ON `price_lists` (`active`);--> statement-breakpoint
INSERT INTO `price_lists` (`id`, `name`, `version`, `currency`, `tax_name`, `tax_rate_bps`, `prices_include_tax`, `valid_from`, `active`, `notes`, `created_at`, `updated_at`) VALUES
('price-list-vlc-it-2025-09', 'Listino pubblicitario VLC', '2025.09', 'EUR', 'IGIC', 700, 0, NULL, 1, 'Importato da VLC_pricelist_IT.pdf. Prezzi base mensili netti, validi su tutte le cinque isole.', '2025-09-23T00:00:00.000Z', '2025-09-23T00:00:00.000Z');--> statement-breakpoint
INSERT INTO `price_items` (`id`, `price_list_id`, `code`, `category`, `name`, `dimensions`, `monthly_price_cents`, `included_services`, `active`, `sort_order`, `version`, `created_at`, `updated_at`) VALUES
('price-cover-manchette', 'price-list-vlc-it-2025-09', 'COP-MANCHETTE', 'cover', 'Manchette copertina', '70 x 38 mm', 100000, '1 spazio in prima pagina\n1 articolo cartaceo / 1 pagina intera\n1 articolo online\nReport Facebook (25.000 follower)', 1, 10, 1, '2025-09-23T00:00:00.000Z', '2025-09-23T00:00:00.000Z'),
('price-cover-banner', 'price-list-vlc-it-2025-09', 'COP-BANNER', 'cover', 'Banner sotto il titolo', '185 x 30 mm', 150000, '1 spazio in prima pagina\n1 articolo cartaceo / 1 pagina intera\n1 articolo online\nReport Facebook (25.000 follower)', 1, 20, 1, '2025-09-23T00:00:00.000Z', '2025-09-23T00:00:00.000Z'),
('price-cover-piedone', 'price-list-vlc-it-2025-09', 'COP-PIEDONE', 'cover', 'Piedone copertina', '259 x 75 mm', 200000, '1 spazio in prima pagina\n1 articolo cartaceo / 1 pagina intera\n1 articolo online\nReport Facebook (25.000 follower)', 1, 30, 1, '2025-09-23T00:00:00.000Z', '2025-09-23T00:00:00.000Z'),
('price-internal-high-full', 'price-list-vlc-it-2025-09', 'INT-ALTA-PAGINA', 'internal_high', 'Pagina intera', '259 x 330 mm', 70000, '1 articolo online\nReport Facebook (25.000 follower)', 1, 40, 1, '2025-09-23T00:00:00.000Z', '2025-09-23T00:00:00.000Z'),
('price-internal-high-half', 'price-list-vlc-it-2025-09', 'INT-ALTA-MEZZA', 'internal_high', 'Mezza pagina', '259 x 160 mm', 50000, '1 articolo online\nReport Facebook (25.000 follower)', 1, 50, 1, '2025-09-23T00:00:00.000Z', '2025-09-23T00:00:00.000Z'),
('price-internal-high-piedone', 'price-list-vlc-it-2025-09', 'INT-ALTA-PIEDONE', 'internal_high', 'Piedone', '259 x 75 mm', 38000, '1 articolo online\nReport Facebook (25.000 follower)', 1, 60, 1, '2025-09-23T00:00:00.000Z', '2025-09-23T00:00:00.000Z'),
('price-internal-high-piedino', 'price-list-vlc-it-2025-09', 'INT-ALTA-PIEDINO', 'internal_high', 'Piedino', '259 x 40 mm', 34000, '1 articolo online\nReport Facebook (25.000 follower)', 1, 70, 1, '2025-09-23T00:00:00.000Z', '2025-09-23T00:00:00.000Z'),
('price-internal-low-half-footer', 'price-list-vlc-it-2025-09', 'INT-BASSA-MEZZO-PIEDONE', 'internal_low', 'Mezzo piedone', '127 x 75 mm', 26000, NULL, 1, 80, 1, '2025-09-23T00:00:00.000Z', '2025-09-23T00:00:00.000Z'),
('price-internal-low-half-foot', 'price-list-vlc-it-2025-09', 'INT-BASSA-MEZZO-PIEDINO', 'internal_low', 'Mezzo piedino', '127 x 40 mm', 20000, NULL, 1, 90, 1, '2025-09-23T00:00:00.000Z', '2025-09-23T00:00:00.000Z'),
('price-internal-low-quarter', 'price-list-vlc-it-2025-09', 'INT-BASSA-QUARTO', 'internal_low', 'Quarto di pagina', '127 x 160 mm', 30000, NULL, 1, 100, 1, '2025-09-23T00:00:00.000Z', '2025-09-23T00:00:00.000Z'),
('price-back-full', 'price-list-vlc-it-2025-09', 'ULT-PAGINA', 'back_cover', 'Pagina intera', '259 x 330 mm', 200000, '1 articolo online\nReport Facebook (25.000 follower)', 1, 110, 1, '2025-09-23T00:00:00.000Z', '2025-09-23T00:00:00.000Z'),
('price-back-half', 'price-list-vlc-it-2025-09', 'ULT-MEZZA', 'back_cover', 'Mezza pagina', '259 x 160 mm', 120000, '1 articolo online\nReport Facebook (25.000 follower)', 1, 120, 1, '2025-09-23T00:00:00.000Z', '2025-09-23T00:00:00.000Z');
