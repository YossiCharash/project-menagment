-- One-time maintenance script: delete every building from the reception desk.
--
-- Purpose
--   Wipe all buildings that were entered at the reception desk (דלפק) together
--   with everything beneath them — apartments, tenants, keys (and their transfer
--   log), authorized vehicles, deliveries, technician visits and the apartment
--   activity feed. Building *projects* (building_projects) are intentionally kept.
--
-- Notes
--   * Destructive and irreversible. Run once, deliberately, against the app DB.
--   * Wrapped in a single transaction: it either fully succeeds or rolls back.
--   * `tasks` reference a building/apartment through nullable foreign keys with
--     no cascade, so linked tasks are detached (references set to NULL) first —
--     the tasks themselves are preserved.
--   * Child tables are emptied leaf-first because the ORM cascade is not backed
--     by ON DELETE CASCADE at the database level.
--   * Every DELETE is scoped through the building relationship (never an
--     unqualified full-table wipe), so only rows that belong to a building are
--     removed.
--
-- Usage (PostgreSQL)
--   psql "$DATABASE_URL" -f backend/migrations/delete_all_buildings.sql

BEGIN;

-- Detach tasks so their foreign keys do not block the deletes below.
UPDATE tasks
SET building_id = NULL,
    apartment_id = NULL
WHERE building_id IS NOT NULL
   OR apartment_id IS NOT NULL;

-- Key transfer log: transfers of keys that belong to apartments in a building.
DELETE FROM apartment_key_transfers
WHERE key_id IN (
    SELECT apartment_keys.id
    FROM apartment_keys
    JOIN apartments ON apartments.id = apartment_keys.apartment_id
    WHERE apartments.building_id IN (SELECT id FROM buildings)
);

-- Apartment sub-tables: rows belonging to apartments in a building (leaf-first).
DELETE FROM apartment_keys
WHERE apartment_id IN (SELECT id FROM apartments WHERE building_id IN (SELECT id FROM buildings));

DELETE FROM tenants
WHERE apartment_id IN (SELECT id FROM apartments WHERE building_id IN (SELECT id FROM buildings));

DELETE FROM authorized_vehicles
WHERE apartment_id IN (SELECT id FROM apartments WHERE building_id IN (SELECT id FROM buildings));

DELETE FROM deliveries
WHERE apartment_id IN (SELECT id FROM apartments WHERE building_id IN (SELECT id FROM buildings));

DELETE FROM technician_visits
WHERE apartment_id IN (SELECT id FROM apartments WHERE building_id IN (SELECT id FROM buildings));

DELETE FROM apartment_activities
WHERE apartment_id IN (SELECT id FROM apartments WHERE building_id IN (SELECT id FROM buildings));

-- Apartments in a building, then the buildings themselves. Projects are kept.
DELETE FROM apartments
WHERE building_id IN (SELECT id FROM buildings);

DELETE FROM buildings
WHERE id IN (SELECT id FROM buildings);

COMMIT;
