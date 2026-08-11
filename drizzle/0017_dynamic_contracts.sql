ALTER TABLE `clients` ADD `tax_id` text;
--> statement-breakpoint
ALTER TABLE `clients` ADD `fiscal_address` text;
--> statement-breakpoint
ALTER TABLE `clients` ADD `billing_email` text;
--> statement-breakpoint
ALTER TABLE `clients` ADD `legal_signer_name` text;
--> statement-breakpoint
ALTER TABLE `clients` ADD `legal_signer_role` text;
--> statement-breakpoint
ALTER TABLE `contracts` ADD `contract_data_json` text;
