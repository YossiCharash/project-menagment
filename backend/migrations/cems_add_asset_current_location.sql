-- =============================================================================
-- CEMS — Add `current_location` to fixed assets
-- =============================================================================
-- Purpose:
--   Allow an asset to be moved to a free-text location that is not a
--   project/warehouse (e.g. a client site or a repair shop). When set, the
--   asset has no `current_warehouse_id`. Nullable, since most assets live in
--   a warehouse or with a custodian.
--
-- Apply with:
--   psql -d <db> -f backend/migrations/cems_add_asset_current_location.sql
--
-- This script is idempotent — re-running it is safe.
-- =============================================================================

ALTER TABLE cems_fixed_assets
    ADD COLUMN IF NOT EXISTS current_location VARCHAR(500);
