-- Repair production databases where migration 0009 was only partially applied.
-- This migration is intentionally idempotent so it is safe for both existing and new D1 databases.
CREATE TABLE IF NOT EXISTS `auth_rate_limits` (
  `key` text PRIMARY KEY NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `window_started_at` text NOT NULL,
  `blocked_until` text
);
