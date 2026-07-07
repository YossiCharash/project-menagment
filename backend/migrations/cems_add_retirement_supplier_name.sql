-- =============================================================================
-- CEMS — Add `supplier_name` to asset retirements
-- =============================================================================
-- Purpose:
--   Support the "return to supplier" disposal option. When a retirement's
--   `disposal_method` is "RETURN_TO_SUPPLIER" (or its Hebrew label), managers
--   can record the supplier the asset was returned to via this free-text
--   column. Nullable, since it is only relevant for that disposal method.
--
-- Apply with:
--   psql -d <db> -f backend/migrations/cems_add_retirement_supplier_name.sql
--
-- This script is idempotent — re-running it is safe.
-- =============================================================================

ALTER TABLE cems_asset_retirements
    ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255);
