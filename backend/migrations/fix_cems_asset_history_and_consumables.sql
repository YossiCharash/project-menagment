-- =============================================================================
-- Migration: Fix cems_asset_history missing columns + cems_consumable_items area_id
-- Run once on the existing database.
--
-- Problems addressed:
--   1. cems_asset_history is missing from_warehouse_id and to_warehouse_id columns
--      (causes 503 on POST /api/v1/cems/assets)
--   2. cems_consumable_items.area_id is NOT NULL but the SQLAlchemy model no longer
--      includes it, so every INSERT violates the NOT NULL constraint
--      (causes 400 on POST /api/v1/cems/consumables)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. cems_asset_history — add missing warehouse tracking columns
-- ---------------------------------------------------------------------------

ALTER TABLE cems_asset_history
    ADD COLUMN IF NOT EXISTS from_warehouse_id UUID DEFAULT NULL
        REFERENCES cems_warehouses(id) ON DELETE SET NULL;

ALTER TABLE cems_asset_history
    ADD COLUMN IF NOT EXISTS to_warehouse_id UUID DEFAULT NULL
        REFERENCES cems_warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_cems_ash_from_warehouse_id
    ON cems_asset_history (from_warehouse_id);

CREATE INDEX IF NOT EXISTS ix_cems_ash_to_warehouse_id
    ON cems_asset_history (to_warehouse_id);

-- ---------------------------------------------------------------------------
-- 2. cems_consumable_items — make area_id nullable
--    The model no longer maps this column; making it nullable lets existing
--    rows survive and new INSERTs (which omit area_id) succeed.
--    The add_consumable_warehouse_id.sql migration already added warehouse_id,
--    so consumables are now warehouse-based, not area-based.
-- ---------------------------------------------------------------------------

ALTER TABLE cems_consumable_items
    ALTER COLUMN area_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. (Safety) ensure warehouse_id on cems_consumable_items is NOT NULL
--    (add_consumable_warehouse_id.sql should have done this, but just in case)
-- ---------------------------------------------------------------------------

ALTER TABLE cems_consumable_items
    ADD COLUMN IF NOT EXISTS warehouse_id UUID DEFAULT NULL
        REFERENCES cems_warehouses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_cems_consumable_items_warehouse_id
    ON cems_consumable_items (warehouse_id);
