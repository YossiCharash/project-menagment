-- =============================================================================
-- CEMS — Add self-referential `parent_id` hierarchy to warehouses
-- =============================================================================
-- Purpose:
--   Introduce a real sub-warehouse hierarchy. A warehouse may point at a
--   parent warehouse so that sub-warehouses under a project are
--   distinguishable from top-level ones. `ON DELETE SET NULL` so deleting a
--   parent orphans (rather than deletes) its children.
--
-- Apply with:
--   psql -d <db> -f backend/migrations/cems_add_warehouse_parent_hierarchy.sql
--
-- This script is idempotent — re-running it is safe.
-- =============================================================================

BEGIN;

ALTER TABLE cems_warehouses
    ADD COLUMN IF NOT EXISTS parent_id UUID;

-- Add the self-referential FK only if it does not already exist.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_cems_warehouses_parent_id'
    ) THEN
        ALTER TABLE cems_warehouses
            ADD CONSTRAINT fk_cems_warehouses_parent_id
            FOREIGN KEY (parent_id)
            REFERENCES cems_warehouses (id)
            ON DELETE SET NULL;
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS ix_cems_warehouses_parent_id
    ON cems_warehouses (parent_id);

COMMIT;
