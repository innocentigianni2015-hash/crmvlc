-- Selective production cleanup. Only records explicitly marked as test/demo are
-- removed. The configured Super Admin and MarcoLifestyle accounts are guarded.
CREATE TABLE `_purge_guard` (
  `value` integer NOT NULL CHECK (`value` = 1)
);
--> statement-breakpoint
INSERT INTO `_purge_guard` (`value`)
SELECT CASE WHEN
  EXISTS (
    SELECT 1 FROM `users`
    WHERE lower(`email`) = 'innocentigianni@proton.me' AND `role` = 'super_admin'
  )
  AND EXISTS (
    SELECT 1 FROM `users`
    WHERE lower(`email`) = 'marcolifestyle.official@gmail.com'
  )
THEN 1 ELSE 0 END;
--> statement-breakpoint
CREATE TABLE `_purge_test_users` (`id` text PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO `_purge_test_users` (`id`)
SELECT `id` FROM `users`
WHERE lower(`email`) NOT IN ('innocentigianni@proton.me', 'marcolifestyle.official@gmail.com')
  AND (
    (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
    OR (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %'
    OR lower(`email`) GLOB 'test@*'
    OR lower(`email`) GLOB 'test+*@*'
    OR lower(`email`) GLOB 'demo@*'
    OR lower(`email`) GLOB 'demo+*@*'
    OR lower(`email`) GLOB '*@example.com'
    OR lower(`email`) GLOB '*@example.org'
    OR lower(`email`) GLOB '*@example.net'
    OR lower(`email`) GLOB '*@test.local'
    OR lower(`id`) GLOB 'test-*'
    OR lower(`id`) GLOB 'demo-*'
  );
--> statement-breakpoint
CREATE TABLE `_purge_test_clients` (`id` text PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO `_purge_test_clients` (`id`)
SELECT `id` FROM `clients`
WHERE (' ' || replace(replace(lower(`company_name`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`company_name`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %'
   OR (' ' || replace(replace(lower(`contact_name`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`contact_name`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %'
   OR lower(`email`) GLOB 'test@*'
   OR lower(`email`) GLOB 'test+*@*'
   OR lower(`email`) GLOB 'demo@*'
   OR lower(`email`) GLOB 'demo+*@*'
   OR lower(`email`) GLOB '*@example.com'
   OR lower(`email`) GLOB '*@example.org'
   OR lower(`email`) GLOB '*@example.net'
   OR lower(`id`) GLOB 'test-*'
   OR lower(`id`) GLOB 'demo-*';
--> statement-breakpoint
CREATE TABLE `_purge_test_quotes` (`id` text PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO `_purge_test_quotes` (`id`)
SELECT `id` FROM `quotes`
WHERE `client_id` IN (SELECT `id` FROM `_purge_test_clients`)
   OR (' ' || replace(replace(lower(`customer_company`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`customer_company`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %'
   OR lower(`customer_email`) GLOB 'test@*'
   OR lower(`customer_email`) GLOB 'test+*@*'
   OR lower(`customer_email`) GLOB 'demo@*'
   OR lower(`customer_email`) GLOB 'demo+*@*'
   OR lower(`customer_email`) GLOB '*@example.com'
   OR lower(`customer_email`) GLOB '*@example.org'
   OR lower(`customer_email`) GLOB '*@example.net';
--> statement-breakpoint
CREATE TABLE `_purge_test_contracts` (`id` text PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO `_purge_test_contracts` (`id`)
SELECT `id` FROM `contracts`
WHERE `client_id` IN (SELECT `id` FROM `_purge_test_clients`)
   OR `quote_id` IN (SELECT `id` FROM `_purge_test_quotes`)
   OR (' ' || replace(replace(lower(`title`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`title`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %'
   OR lower(coalesce(`signer_email`, '')) GLOB 'test@*'
   OR lower(coalesce(`signer_email`, '')) GLOB 'test+*@*'
   OR lower(coalesce(`signer_email`, '')) GLOB 'demo@*'
   OR lower(coalesce(`signer_email`, '')) GLOB 'demo+*@*'
   OR lower(coalesce(`signer_email`, '')) GLOB '*@example.com'
   OR lower(coalesce(`signer_email`, '')) GLOB '*@example.org'
   OR lower(coalesce(`signer_email`, '')) GLOB '*@example.net';
--> statement-breakpoint
CREATE TABLE `_purge_test_deliveries` (`id` text PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO `_purge_test_deliveries` (`id`)
SELECT `id` FROM `deliveries`
WHERE `client_id` IN (SELECT `id` FROM `_purge_test_clients`)
   OR (' ' || replace(replace(lower(`delivery_contact_name`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`delivery_contact_name`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %'
   OR lower(`delivery_contact_email`) GLOB 'test@*'
   OR lower(`delivery_contact_email`) GLOB 'test+*@*'
   OR lower(`delivery_contact_email`) GLOB 'demo@*'
   OR lower(`delivery_contact_email`) GLOB 'demo+*@*'
   OR lower(`delivery_contact_email`) GLOB '*@example.com'
   OR lower(`delivery_contact_email`) GLOB '*@example.org'
   OR lower(`delivery_contact_email`) GLOB '*@example.net';
--> statement-breakpoint
CREATE TABLE `_purge_test_points` (`id` text PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO `_purge_test_points` (`id`)
SELECT `id` FROM `distribution_points`
WHERE `client_id` IN (SELECT `id` FROM `_purge_test_clients`)
   OR (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %';
--> statement-breakpoint
CREATE TABLE `_purge_test_sponsors` (`id` text PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO `_purge_test_sponsors` (`id`)
SELECT `id` FROM `sponsors`
WHERE `client_id` IN (SELECT `id` FROM `_purge_test_clients`)
   OR (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %';
--> statement-breakpoint
CREATE TABLE `_purge_test_members` (`id` text PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO `_purge_test_members` (`id`)
SELECT `id` FROM `vip_members`
WHERE (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %';
--> statement-breakpoint
CREATE TABLE `_purge_test_campaigns` (`id` text PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO `_purge_test_campaigns` (`id`)
SELECT `id` FROM `discount_campaigns`
WHERE (' ' || replace(replace(lower(`title`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`title`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %';
--> statement-breakpoint
CREATE TABLE `_purge_test_templates` (`id` text PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO `_purge_test_templates` (`id`)
SELECT `id` FROM `contract_templates`
WHERE (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %'
   OR (' ' || replace(replace(lower(`original_filename`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`original_filename`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %';
--> statement-breakpoint

-- R2 objects cannot be removed by SQL. Queue them for the Worker cron before
-- deleting their database records.
CREATE TABLE IF NOT EXISTS `r2_deletion_queue` (
  `r2_key` text PRIMARY KEY NOT NULL,
  `source` text NOT NULL,
  `created_at` text NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `last_error` text
);
--> statement-breakpoint
INSERT OR IGNORE INTO `r2_deletion_queue` (`r2_key`,`source`,`created_at`)
SELECT `pdf_r2_key`, 'test_quote', CURRENT_TIMESTAMP FROM `quotes`
WHERE `id` IN (SELECT `id` FROM `_purge_test_quotes`) AND `pdf_r2_key` <> '';
--> statement-breakpoint
INSERT OR IGNORE INTO `r2_deletion_queue` (`r2_key`,`source`,`created_at`)
SELECT `draft_r2_key`, 'test_contract', CURRENT_TIMESTAMP FROM `contracts`
WHERE `id` IN (SELECT `id` FROM `_purge_test_contracts`) AND `draft_r2_key` <> '';
--> statement-breakpoint
INSERT OR IGNORE INTO `r2_deletion_queue` (`r2_key`,`source`,`created_at`)
SELECT `signed_r2_key`, 'test_contract', CURRENT_TIMESTAMP FROM `contracts`
WHERE `id` IN (SELECT `id` FROM `_purge_test_contracts`) AND `signed_r2_key` IS NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `r2_deletion_queue` (`r2_key`,`source`,`created_at`)
SELECT `signature_r2_key`, 'test_contract', CURRENT_TIMESTAMP FROM `contracts`
WHERE `id` IN (SELECT `id` FROM `_purge_test_contracts`) AND `signature_r2_key` IS NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `r2_deletion_queue` (`r2_key`,`source`,`created_at`)
SELECT `evidence_r2_key`, 'test_contract', CURRENT_TIMESTAMP FROM `contracts`
WHERE `id` IN (SELECT `id` FROM `_purge_test_contracts`) AND `evidence_r2_key` IS NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `r2_deletion_queue` (`r2_key`,`source`,`created_at`)
SELECT `r2_key`, 'test_photo', CURRENT_TIMESTAMP FROM `photo_audits`
WHERE `delivery_id` IN (SELECT `id` FROM `_purge_test_deliveries`);
--> statement-breakpoint
INSERT OR IGNORE INTO `r2_deletion_queue` (`r2_key`,`source`,`created_at`)
SELECT `r2_key`, 'test_template', CURRENT_TIMESTAMP FROM `contract_templates`
WHERE `id` IN (SELECT `id` FROM `_purge_test_templates`);
--> statement-breakpoint

-- Delete explicitly identified operational data in foreign-key-safe order.
DELETE FROM `faq_tickets`
WHERE `interaction_id` IN (SELECT `id` FROM `ai_interactions` WHERE `user_id` IN (SELECT `id` FROM `_purge_test_users`))
   OR `user_id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
DELETE FROM `ai_interactions` WHERE `user_id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
DELETE FROM `photo_audits`
WHERE `delivery_id` IN (SELECT `id` FROM `_purge_test_deliveries`)
   OR `distributor_user_id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
DELETE FROM `vip_events`
WHERE `member_id` IN (SELECT `id` FROM `_purge_test_members`)
   OR `sponsor_id` IN (SELECT `id` FROM `_purge_test_sponsors`);
--> statement-breakpoint
DELETE FROM `coupons`
WHERE `member_id` IN (SELECT `id` FROM `_purge_test_members`)
   OR `sponsor_id` IN (SELECT `id` FROM `_purge_test_sponsors`);
--> statement-breakpoint
DELETE FROM `ad_inventory`
WHERE `client_id` IN (SELECT `id` FROM `_purge_test_clients`)
   OR `contract_id` IN (SELECT `id` FROM `_purge_test_contracts`)
   OR (' ' || replace(replace(lower(`issue_label`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`issue_label`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %';
--> statement-breakpoint
DELETE FROM `sales_tasks`
WHERE `client_id` IN (SELECT `id` FROM `_purge_test_clients`)
   OR `user_id` IN (SELECT `id` FROM `_purge_test_users`)
   OR (' ' || replace(replace(lower(`title`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`title`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %';
--> statement-breakpoint
DELETE FROM `sales_checkins` WHERE `user_id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
DELETE FROM `wallet_entries` WHERE `user_id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
DELETE FROM `payout_requests` WHERE `user_id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
DELETE FROM `landing_leads`
WHERE `client_id` IN (SELECT `id` FROM `_purge_test_clients`)
   OR (' ' || replace(replace(lower(`company`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`company`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %'
   OR lower(`email`) GLOB 'test@*'
   OR lower(`email`) GLOB 'test+*@*'
   OR lower(`email`) GLOB 'demo@*'
   OR lower(`email`) GLOB 'demo+*@*'
   OR lower(`email`) GLOB '*@example.com'
   OR lower(`email`) GLOB '*@example.org'
   OR lower(`email`) GLOB '*@example.net';
--> statement-breakpoint
DELETE FROM `sales_applications`
WHERE (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %'
   OR lower(`email`) GLOB 'test@*'
   OR lower(`email`) GLOB 'test+*@*'
   OR lower(`email`) GLOB 'demo@*'
   OR lower(`email`) GLOB 'demo+*@*'
   OR lower(`email`) GLOB '*@example.com'
   OR lower(`email`) GLOB '*@example.org'
   OR lower(`email`) GLOB '*@example.net';
--> statement-breakpoint
DELETE FROM `podcast_appointments`
WHERE `interviewer_user_id` IN (SELECT `id` FROM `_purge_test_users`)
   OR `created_by` IN (SELECT `id` FROM `_purge_test_users`)
   OR (' ' || replace(replace(lower(`guest_name`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`guest_name`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %'
   OR (' ' || replace(replace(lower(`topic`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`topic`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %';
--> statement-breakpoint
DELETE FROM `quote_items` WHERE `quote_id` IN (SELECT `id` FROM `_purge_test_quotes`);
--> statement-breakpoint
DELETE FROM `contracts` WHERE `id` IN (SELECT `id` FROM `_purge_test_contracts`);
--> statement-breakpoint
DELETE FROM `quotes` WHERE `id` IN (SELECT `id` FROM `_purge_test_quotes`);
--> statement-breakpoint
DELETE FROM `deliveries` WHERE `id` IN (SELECT `id` FROM `_purge_test_deliveries`);
--> statement-breakpoint
UPDATE `deliveries` SET `distribution_point_id` = NULL
WHERE `distribution_point_id` IN (SELECT `id` FROM `_purge_test_points`);
--> statement-breakpoint
DELETE FROM `distribution_points` WHERE `id` IN (SELECT `id` FROM `_purge_test_points`);
--> statement-breakpoint
DELETE FROM `sponsors` WHERE `id` IN (SELECT `id` FROM `_purge_test_sponsors`);
--> statement-breakpoint
DELETE FROM `vip_members` WHERE `id` IN (SELECT `id` FROM `_purge_test_members`);
--> statement-breakpoint
DELETE FROM `clients` WHERE `id` IN (SELECT `id` FROM `_purge_test_clients`);
--> statement-breakpoint
-- An issued quote is legally/audit immutable. Never remove its promotion link;
-- retain any campaign that is still referenced by a quote and delete only
-- orphaned test campaigns.
DELETE FROM `discount_campaigns`
WHERE `id` IN (SELECT `id` FROM `_purge_test_campaigns`)
  AND NOT EXISTS (
    SELECT 1 FROM `quotes` q WHERE q.`discount_campaign_id` = `discount_campaigns`.`id`
  );
--> statement-breakpoint
UPDATE `contracts` SET `template_id` = NULL
WHERE `template_id` IN (SELECT `id` FROM `_purge_test_templates`);
--> statement-breakpoint
DELETE FROM `contract_templates` WHERE `id` IN (SELECT `id` FROM `_purge_test_templates`);
--> statement-breakpoint
DELETE FROM `faq_entries`
WHERE (' ' || replace(replace(lower(`title`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`title`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %';
--> statement-breakpoint
DELETE FROM `bundles`
WHERE (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %';
--> statement-breakpoint
DELETE FROM `commission_rules`
WHERE (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% test %'
   OR (' ' || replace(replace(lower(`name`), '-', ' '), '_', ' ') || ' ') LIKE '% demo %';
--> statement-breakpoint

-- Preserve any non-test business record that merely referenced a test user.
UPDATE `clients` SET
  `owner_user_id` = CASE WHEN `owner_user_id` IN (SELECT `id` FROM `_purge_test_users`) THEN (SELECT `id` FROM `users` WHERE lower(`email`) = 'innocentigianni@proton.me' LIMIT 1) ELSE `owner_user_id` END,
  `created_by` = CASE WHEN `created_by` IN (SELECT `id` FROM `_purge_test_users`) THEN (SELECT `id` FROM `users` WHERE lower(`email`) = 'innocentigianni@proton.me' LIMIT 1) ELSE `created_by` END;
--> statement-breakpoint
UPDATE `deliveries` SET
  `distributor_user_id` = CASE WHEN `distributor_user_id` IN (SELECT `id` FROM `_purge_test_users`) THEN (SELECT `id` FROM `users` WHERE lower(`email`) = 'innocentigianni@proton.me' LIMIT 1) ELSE `distributor_user_id` END,
  `created_by` = CASE WHEN `created_by` IN (SELECT `id` FROM `_purge_test_users`) THEN (SELECT `id` FROM `users` WHERE lower(`email`) = 'innocentigianni@proton.me' LIMIT 1) ELSE `created_by` END;
--> statement-breakpoint
UPDATE `quotes` SET
  `owner_user_id` = CASE WHEN `owner_user_id` IN (SELECT `id` FROM `_purge_test_users`) THEN (SELECT `id` FROM `users` WHERE lower(`email`) = 'innocentigianni@proton.me' LIMIT 1) ELSE `owner_user_id` END,
  `created_by` = CASE WHEN `created_by` IN (SELECT `id` FROM `_purge_test_users`) THEN (SELECT `id` FROM `users` WHERE lower(`email`) = 'innocentigianni@proton.me' LIMIT 1) ELSE `created_by` END;
--> statement-breakpoint
UPDATE `contracts` SET
  `owner_user_id` = CASE WHEN `owner_user_id` IN (SELECT `id` FROM `_purge_test_users`) THEN (SELECT `id` FROM `users` WHERE lower(`email`) = 'innocentigianni@proton.me' LIMIT 1) ELSE `owner_user_id` END,
  `created_by` = CASE WHEN `created_by` IN (SELECT `id` FROM `_purge_test_users`) THEN (SELECT `id` FROM `users` WHERE lower(`email`) = 'innocentigianni@proton.me' LIMIT 1) ELSE `created_by` END,
  `cancelled_by` = CASE WHEN `cancelled_by` IN (SELECT `id` FROM `_purge_test_users`) THEN NULL ELSE `cancelled_by` END;
--> statement-breakpoint
UPDATE `contract_templates` SET `created_by` = (SELECT `id` FROM `users` WHERE lower(`email`) = 'innocentigianni@proton.me' LIMIT 1)
WHERE `created_by` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
UPDATE `discount_campaigns` SET
  `created_by` = CASE WHEN `created_by` IN (SELECT `id` FROM `_purge_test_users`) THEN (SELECT `id` FROM `users` WHERE lower(`email`) = 'innocentigianni@proton.me' LIMIT 1) ELSE `created_by` END,
  `deactivated_by` = CASE WHEN `deactivated_by` IN (SELECT `id` FROM `_purge_test_users`) THEN NULL ELSE `deactivated_by` END;
--> statement-breakpoint
UPDATE `sponsors` SET `owner_user_id` = (SELECT `id` FROM `users` WHERE lower(`email`) = 'innocentigianni@proton.me' LIMIT 1)
WHERE `owner_user_id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
UPDATE `coupons` SET `redeemed_by_user_id` = NULL WHERE `redeemed_by_user_id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
UPDATE `payout_requests` SET `reviewed_by` = NULL WHERE `reviewed_by` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
UPDATE `audit_events` SET `actor_user_id` = NULL WHERE `actor_user_id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
UPDATE `faq_entries` SET
  `created_by` = CASE WHEN `created_by` IN (SELECT `id` FROM `_purge_test_users`) THEN NULL ELSE `created_by` END,
  `updated_by` = CASE WHEN `updated_by` IN (SELECT `id` FROM `_purge_test_users`) THEN NULL ELSE `updated_by` END,
  `approved_by` = CASE WHEN `approved_by` IN (SELECT `id` FROM `_purge_test_users`) THEN NULL ELSE `approved_by` END;
--> statement-breakpoint
UPDATE `landing_leads` SET `assigned_manager_id` = NULL WHERE `assigned_manager_id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
UPDATE `sales_applications` SET `reviewed_by` = NULL WHERE `reviewed_by` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
UPDATE `vip_members` SET `created_by_user_id` = NULL WHERE `created_by_user_id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
UPDATE `users` SET `sales_manager_id` = NULL WHERE `sales_manager_id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
DELETE FROM `sessions` WHERE `user_id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
DELETE FROM `auth_flow_tokens` WHERE `user_id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint
DELETE FROM `auth_challenges`
WHERE `requested_by_user_id` IN (SELECT `id` FROM `_purge_test_users`)
   OR lower(`email`) GLOB 'test@*'
   OR lower(`email`) GLOB 'test+*@*'
   OR lower(`email`) GLOB 'demo@*'
   OR lower(`email`) GLOB 'demo+*@*'
   OR lower(`email`) GLOB '*@example.com'
   OR lower(`email`) GLOB '*@example.org'
   OR lower(`email`) GLOB '*@example.net';
--> statement-breakpoint
DELETE FROM `auth_rate_limits`
WHERE lower(`key`) GLOB '*test@*' OR lower(`key`) GLOB '*demo@*' OR lower(`key`) GLOB '*@example.com*';
--> statement-breakpoint
DELETE FROM `email_outbox`
WHERE lower(`recipient`) GLOB 'test@*'
   OR lower(`recipient`) GLOB 'test+*@*'
   OR lower(`recipient`) GLOB 'demo@*'
   OR lower(`recipient`) GLOB 'demo+*@*'
   OR lower(`recipient`) GLOB '*@example.com'
   OR lower(`recipient`) GLOB '*@example.org'
   OR lower(`recipient`) GLOB '*@example.net';
--> statement-breakpoint
DELETE FROM `users` WHERE `id` IN (SELECT `id` FROM `_purge_test_users`);
--> statement-breakpoint

DROP TABLE `_purge_test_templates`;
--> statement-breakpoint
DROP TABLE `_purge_test_campaigns`;
--> statement-breakpoint
DROP TABLE `_purge_test_members`;
--> statement-breakpoint
DROP TABLE `_purge_test_sponsors`;
--> statement-breakpoint
DROP TABLE `_purge_test_points`;
--> statement-breakpoint
DROP TABLE `_purge_test_deliveries`;
--> statement-breakpoint
DROP TABLE `_purge_test_contracts`;
--> statement-breakpoint
DROP TABLE `_purge_test_quotes`;
--> statement-breakpoint
DROP TABLE `_purge_test_clients`;
--> statement-breakpoint
DROP TABLE `_purge_test_users`;
--> statement-breakpoint
DROP TABLE `_purge_guard`;
