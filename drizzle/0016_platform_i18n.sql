ALTER TABLE `users` ADD `language` text DEFAULT 'es' NOT NULL;
--> statement-breakpoint
CREATE TABLE `faq_entries_i18n` (
  `id` text PRIMARY KEY NOT NULL,
  `translation_group_id` text NOT NULL,
  `language` text NOT NULL CHECK (`language` IN ('es', 'it', 'en')),
  `module_key` text NOT NULL,
  `title` text NOT NULL,
  `question` text NOT NULL,
  `answer` text NOT NULL,
  `allowed_roles_json` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL CHECK (`status` IN ('draft', 'published', 'retired')),
  `version` integer DEFAULT 1 NOT NULL,
  `created_by` text REFERENCES `users`(`id`),
  `updated_by` text REFERENCES `users`(`id`),
  `approved_by` text REFERENCES `users`(`id`),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `published_at` text
);
--> statement-breakpoint
INSERT INTO `faq_entries_i18n` SELECT * FROM `faq_entries`;
--> statement-breakpoint
CREATE TABLE `ai_interactions_i18n` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `role` text NOT NULL,
  `island` text,
  `language` text NOT NULL CHECK (`language` IN ('es', 'it', 'en')),
  `module_key` text NOT NULL,
  `question` text NOT NULL,
  `answer` text NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('answered', 'escalated', 'budget_blocked', 'error')),
  `sources_json` text DEFAULT '[]' NOT NULL,
  `model` text,
  `prompt_tokens` integer DEFAULT 0 NOT NULL,
  `completion_tokens` integer DEFAULT 0 NOT NULL,
  `estimated_cost_micro_usd` integer DEFAULT 0 NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `ai_interactions_i18n` SELECT * FROM `ai_interactions`;
--> statement-breakpoint
CREATE TABLE `faq_tickets_i18n` (
  `id` text PRIMARY KEY NOT NULL,
  `interaction_id` text NOT NULL REFERENCES `ai_interactions_i18n`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `role` text NOT NULL,
  `island` text,
  `language` text NOT NULL CHECK (`language` IN ('es', 'it', 'en')),
  `module_key` text NOT NULL,
  `question` text NOT NULL,
  `reason` text NOT NULL,
  `status` text DEFAULT 'open' NOT NULL CHECK (`status` IN ('open', 'resolved')),
  `resolution_note` text,
  `resolved_by` text REFERENCES `users`(`id`),
  `created_at` text NOT NULL,
  `resolved_at` text
);
--> statement-breakpoint
INSERT INTO `faq_tickets_i18n` SELECT * FROM `faq_tickets`;
--> statement-breakpoint
DROP TABLE `faq_tickets`;
--> statement-breakpoint
DROP TABLE `ai_interactions`;
--> statement-breakpoint
DROP TABLE `faq_entries`;
--> statement-breakpoint
ALTER TABLE `faq_entries_i18n` RENAME TO `faq_entries`;
--> statement-breakpoint
ALTER TABLE `ai_interactions_i18n` RENAME TO `ai_interactions`;
--> statement-breakpoint
ALTER TABLE `faq_tickets_i18n` RENAME TO `faq_tickets`;
--> statement-breakpoint
CREATE UNIQUE INDEX `faq_entries_version_unique` ON `faq_entries` (`translation_group_id`,`language`,`version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `faq_entries_one_published_unique` ON `faq_entries` (`translation_group_id`,`language`) WHERE `status` = 'published';
--> statement-breakpoint
CREATE INDEX `faq_entries_published_idx` ON `faq_entries` (`status`,`language`,`module_key`);
--> statement-breakpoint
CREATE INDEX `ai_interactions_user_idx` ON `ai_interactions` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `ai_interactions_status_idx` ON `ai_interactions` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `faq_tickets_queue_idx` ON `faq_tickets` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `faq_tickets_user_idx` ON `faq_tickets` (`user_id`,`created_at`);
--> statement-breakpoint
INSERT INTO `faq_entries` (`id`,`translation_group_id`,`language`,`module_key`,`title`,`question`,`answer`,`allowed_roles_json`,`status`,`version`,`created_at`,`updated_at`,`published_at`) VALUES
('faq-en-crm-1','crm-clienti','en','crm','Manage clients and pipeline','How do I create or update a client in the CRM?','Open 01 CRM and tap “New client”. Enter the company, contact, email, phone, island, value and notes. After saving, move the card through First contact, In negotiation, Proposal, Stand-by, Won or Lost. A Sales user sees their own clients; a Sales Manager sees clients on their island belonging to their assigned Sales team.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-en-os-1','moduli-os','en','operations','Use OS Modules','What are OS Modules for?','Open 02 OS Modules for VIP sponsors and coupons, commissions, advertising inventory, distribution points, photo audits, check-ins and Sales tasks. Available buttons depend on role and island; if a command is missing, your account does not have that permission.','["all"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-en-listino-1','listino-sconti','en','pricing','Price list, IGIC and promotions','How do I prepare a price with an authorised discount?','Open 03 Price list, choose the format and duration. If the Super Admin has authorised an active promotion, select it before issuing the quote. The system calculates taxable amount, discount, IGIC and total. Only the Super Admin changes prices and campaigns; a used promotion remains immutable in history.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-en-preventivi-1','preventivi-pdf','en','quotes','Create and convert quotes','How do I issue a quote and convert it into a contract?','Configure the offer in 03 Price list and create the quote. In 04 Quotes you can open the PDF and, while it is valid and not converted, tap “Create contract”. Conversion creates a linked contract draft and freezes the prices, discount and IGIC. The generated commercial and legal documents remain in Spanish.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-en-contratti-1','contratti-firma','en','contracts','Contracts, OTP and signature','How do I have a contract signed?','Open 05 Contracts, create or review the Spanish PDF draft and tap “Sign”. Enter the signatory name and email, send the OTP, capture the on-screen signature and confirm the agent presence. The signed contract and audit evidence become immutable; only the Super Admin can cancel it with a reason and create a new version.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-en-consegne-1','consegne-distributori','en','distribution','Assign and complete deliveries','How does a delivery work?','Super Admin, Admin and Sales Manager can open 06 Deliveries and assign company, distributor, quantity, date and contacts within their scope. A Distributor only sees assigned deliveries and linked companies, then updates the status to Delivered or reports an Issue.','["super_admin","admin","sales_manager","distributor"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-en-utenti-1','gestione-utenti','en','admin','Create users and assign roles','How do I register a Sales user or edit a user?','Open 07 Users and create the account with name, email, temporary password, role and island. Assign a Sales Manager to each Sales user where required. Operational Admin and Super Admin manage operational roles; only the Super Admin can create or promote an Admin. Spanish is the default interface language and each user can change it.','["super_admin","admin"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-en-audit-1','registro-audit','en','audit','Review audit and email','Where can I review sensitive operations?','The Super Admin opens 08 Audit to see recent append-only events, actor, entity and reference. This page also shows pending or failed emails and allows a retry. Actions in Sales View or Distributor View record both the Super Admin and the operational user.','["super_admin"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-en-sales-view-1','vista-sales','en','sales_view','Work in Sales View','How do I verify the real dashboard of a Sales user?','Only the Super Admin opens 09 Sales View, selects an active Sales user and confirms operational access. For up to one hour, every authorised module uses the Sales user’s real data and permissions. Changes are real and the audit also identifies the Super Admin.','["super_admin"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-en-distributor-view-1','vista-distributore','en','distributor_view','Work in Distributor View','How do I verify the real dashboard of a Distributor?','Only the Super Admin opens 10 Distributor View, selects an active Distributor and confirms access. For up to one hour, deliveries, quantities, companies and OS Modules appear exactly as they do for that user. Changes are real and fully audited.','["super_admin"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-en-podcast-1','calendario-podcast','en','podcast','Book a podcast','How do I add a podcast appointment?','Open 11 Podcast and choose guest, topic, interviewer, date and time in the Canary Islands time zone. Every appointment lasts one hour and the system prevents overlaps for the same interviewer. You can select the free one-minute format, the three-to-five-minute package and optional Marcolifestyle participation.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-en-help-1','guida-ai','en','help','Use Help and the AI Assistant','What can the AI Assistant do?','The Assistant explains approved procedures and identifies the correct module for your role. In this phase it never changes data or performs actions. If it cannot find a safe answer, it opens a request in the shared Admin queue. On mobile you can use the microphone: CRMVLC receives and stores only the transcript, never the audio.','["all"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-en-pwa-1','pwa-offline','en','help','Installation and offline work','How do I install CRMVLC and what works offline?','Tap “Install” in the top bar or use “Add to Home Screen” in the browser. Offline you can view the last saved snapshot and capture photos supported by the operational flow; they synchronise when the network returns. Contracts, administration and the AI Assistant require a connection. Access locks after one hour in the background.','["all"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
