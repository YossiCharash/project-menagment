-- Reception-desk projects (פרויקטים) grouping buildings.
--
-- Rationale: a project may now contain several buildings. The building_projects
-- table is created automatically by create_all, but buildings already exists, so
-- its new nullable project_id FK must be added explicitly. Idempotent; also
-- applied at startup by init_database on PostgreSQL.

CREATE TABLE IF NOT EXISTS building_projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

ALTER TABLE buildings ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES building_projects(id);
CREATE INDEX IF NOT EXISTS ix_buildings_project_id ON buildings (project_id);
