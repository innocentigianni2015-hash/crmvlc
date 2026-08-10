ALTER TABLE `contracts` ADD `signed_r2_key` text;--> statement-breakpoint
ALTER TABLE `contracts` ADD `signed_document_sha256` text;
--> statement-breakpoint
CREATE TRIGGER `signed_contract_document_immutable`
BEFORE UPDATE OF `draft_r2_key`, `signed_r2_key`, `document_sha256`, `signed_document_sha256`, `signature_r2_key`, `evidence_r2_key`, `signature_sha256`, `signer_name`, `signer_email`, `signed_at`
ON `contracts`
WHEN OLD.`status` = 'signed'
BEGIN
  SELECT RAISE(ABORT, 'signed contract evidence is immutable');
END;
