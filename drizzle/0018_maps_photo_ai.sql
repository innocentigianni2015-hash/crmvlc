ALTER TABLE deliveries ADD COLUMN distribution_point_id TEXT REFERENCES distribution_points(id);
CREATE INDEX IF NOT EXISTS deliveries_distribution_point_idx ON deliveries(distribution_point_id);

ALTER TABLE photo_audits ADD COLUMN duplicate_of_audit_id TEXT;
ALTER TABLE photo_audits ADD COLUMN ai_model TEXT;
ALTER TABLE photo_audits ADD COLUMN ai_verdict TEXT;
ALTER TABLE photo_audits ADD COLUMN ai_result_json TEXT;
CREATE INDEX IF NOT EXISTS photo_audits_sha256_idx ON photo_audits(sha256);
