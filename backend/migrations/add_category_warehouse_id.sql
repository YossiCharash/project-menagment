-- Migration: Add warehouse_id to cems_asset_categories
-- Purpose: Enable per-warehouse categories so each warehouse/area can have
-- its own set of categories (e.g. electrical, plumbing, cleaning).
-- Categories with warehouse_id = NULL remain global.

-- 1. Add the warehouse_id FK column
ALTER TABLE cems_asset_categories
    ADD COLUMN IF NOT EXISTS warehouse_id UUID
    REFERENCES cems_warehouses(id) ON DELETE CASCADE;

-- 2. Drop the old global unique constraint on name
--    (the constraint name varies depending on how it was originally created)
ALTER TABLE cems_asset_categories DROP CONSTRAINT IF EXISTS cems_asset_categories_name_key;
ALTER TABLE cems_asset_categories DROP CONSTRAINT IF EXISTS uq_cems_asset_categories_name;

-- 3. New partial unique index: same name is allowed in different warehouses,
--    but must be unique within each warehouse
CREATE UNIQUE INDEX IF NOT EXISTS uq_category_name_warehouse
    ON cems_asset_categories (name, warehouse_id)
    WHERE warehouse_id IS NOT NULL;

-- 4. Global categories (warehouse_id IS NULL) must still have a unique name
CREATE UNIQUE INDEX IF NOT EXISTS uq_category_name_global
    ON cems_asset_categories (name)
    WHERE warehouse_id IS NULL;

-- 5. Index for fast warehouse-scoped lookups
CREATE INDEX IF NOT EXISTS ix_cems_asset_categories_warehouse_id
    ON cems_asset_categories (warehouse_id);
