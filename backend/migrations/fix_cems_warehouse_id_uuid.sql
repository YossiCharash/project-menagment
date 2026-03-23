-- Fix cems_warehouse_id type from INTEGER to UUID with FK to cems_warehouses.
-- The column was originally added as INTEGER but cems_warehouses.id is UUID.
-- We drop and re-add rather than ALTER TYPE to avoid cast issues.

ALTER TABLE users DROP COLUMN IF EXISTS cems_warehouse_id;

ALTER TABLE users
    ADD COLUMN cems_warehouse_id UUID DEFAULT NULL
    REFERENCES cems_warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_users_cems_warehouse_id
    ON users (cems_warehouse_id);
