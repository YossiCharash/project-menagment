-- =============================================================================
-- CEMS — Add `what_happened` to asset retirements + audit CASCADE FKs
-- =============================================================================
-- Purpose:
--   1. Add the free-text `what_happened` column to `cems_asset_retirements`
--      so managers can capture what physically happened to the asset
--      (broken, lost, stolen, ...) in addition to the existing `reason`
--      (why it is being moved to the archive).
--   2. Ensure that every FK referencing `cems_fixed_assets(id)` is declared
--      `ON DELETE CASCADE` so that a manager's permanent-delete of an
--      archived asset cleanly wipes all dependent rows in a single
--      transaction.
--
-- Apply with:
--   psql -d <db> -f backend/migrations/cems_add_retirement_what_happened_and_cascade_audit.sql
--
-- This script is idempotent — re-running it is safe.
-- =============================================================================

BEGIN;

-- ---------- 1. Add the new column ------------------------------------------
ALTER TABLE cems_asset_retirements
    ADD COLUMN IF NOT EXISTS what_happened TEXT;

-- ---------- 2. Audit/repair CASCADE on FKs to cems_fixed_assets -------------
-- The helper below walks every FK that references `cems_fixed_assets(id)`
-- and rewrites it with `ON DELETE CASCADE` when the current rule is not
-- already CASCADE.  This guarantees that a hard-delete of an asset
-- propagates to all dependent rows without raising a FK-violation.
DO $$
DECLARE
    fk_record RECORD;
BEGIN
    FOR fk_record IN
        SELECT
            con.conname           AS constraint_name,
            cls.relname           AS table_name,
            pg_get_constraintdef(con.oid) AS definition,
            con.confdeltype       AS delete_rule
        FROM pg_constraint AS con
        JOIN pg_class      AS cls ON cls.oid = con.conrelid
        JOIN pg_class      AS ref ON ref.oid = con.confrelid
        WHERE con.contype = 'f'
          AND ref.relname = 'cems_fixed_assets'
    LOOP
        -- confdeltype 'c' == CASCADE; skip if already CASCADE.
        IF fk_record.delete_rule <> 'c' THEN
            RAISE NOTICE 'Rewriting FK % on %.* to ON DELETE CASCADE',
                fk_record.constraint_name, fk_record.table_name;

            EXECUTE format(
                'ALTER TABLE %I DROP CONSTRAINT %I',
                fk_record.table_name, fk_record.constraint_name
            );

            -- Re-create the constraint with CASCADE.  The original column
            -- list is extracted from the existing definition via regex —
            -- pg_get_constraintdef returns e.g.
            --   FOREIGN KEY (asset_id) REFERENCES cems_fixed_assets(id) ON DELETE SET NULL
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I %s ON DELETE CASCADE',
                fk_record.table_name,
                fk_record.constraint_name,
                regexp_replace(fk_record.definition, '\s+ON DELETE [A-Z ]+', '', 'i')
            );
        END IF;
    END LOOP;
END$$;

-- ---------- 3. Polymorphic documents (no FK by design) ---------------------
-- `cems_documents` references assets via the polymorphic pair
-- (entity_type = 'fixed_asset', entity_id = <asset uuid>) and therefore
-- has no real FK that can be marked CASCADE.  The service layer is
-- responsible for deleting matching rows before/with the asset.
-- (See RetirementService.delete_archived_asset.)

COMMIT;
