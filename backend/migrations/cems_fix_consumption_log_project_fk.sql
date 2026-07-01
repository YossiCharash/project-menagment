-- Fix cems_consumption_logs.project_id to reference the main-system projects
-- table (INTEGER) instead of the empty cems_projects table (UUID).
--
-- Rationale: CEMS reads its project list from the main-system `projects` table
-- (see GET /cems/projects and cems_fixed_assets.project_id, which is an INTEGER
-- FK to projects.id). A previous revision of this migration wrongly pointed
-- project_id at cems_projects (UUID) — a table that is never populated and has
-- no management UI. As a result the consume endpoint received an integer project
-- id from the dropdown and rejected it with a 422 UUID validation error.
--
-- project_id has always been NULL in practice, so dropping and re-adding the
-- column with the correct type/constraint is safe.
--
-- Idempotent: safe to re-run.

-- 1. Drop the old (possibly auto-named) FK constraint, if it exists.
ALTER TABLE cems_consumption_logs
    DROP CONSTRAINT IF EXISTS cems_consumption_logs_project_id_fkey;

-- 2. Drop the old column (whatever its type), if it exists.
ALTER TABLE cems_consumption_logs
    DROP COLUMN IF EXISTS project_id;

-- 3. Re-add project_id as a nullable INTEGER column.
ALTER TABLE cems_consumption_logs
    ADD COLUMN IF NOT EXISTS project_id INTEGER;

-- 4. Re-add the FK constraint pointing at the main-system projects(id).
ALTER TABLE cems_consumption_logs
    ADD CONSTRAINT cems_consumption_logs_project_id_fkey
        FOREIGN KEY (project_id)
        REFERENCES projects (id)
        ON DELETE SET NULL;

-- 5. Index the FK column for withdrawal-report joins.
CREATE INDEX IF NOT EXISTS ix_cems_consumption_logs_project_id
    ON cems_consumption_logs (project_id);
