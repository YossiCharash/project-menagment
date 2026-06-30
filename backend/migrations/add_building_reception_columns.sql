-- Add tasks.apartment_id and tasks.building_id for the Building Reception Desk.
--
-- Rationale: A task may now optionally target a specific apartment (and/or
-- building) handled by the reception desk (דלפק הבניין). The Task model now
-- declares these nullable FK columns, but the live schema was created via
-- create_all (which never alters existing tables), so the columns must be
-- added by hand. Both are nullable so existing rows are unaffected. Indexed
-- because reception-desk views filter tasks by apartment/building.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS apartment_id INTEGER REFERENCES apartments(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS building_id INTEGER REFERENCES buildings(id);
CREATE INDEX IF NOT EXISTS ix_tasks_apartment_id ON tasks (apartment_id);
CREATE INDEX IF NOT EXISTS ix_tasks_building_id ON tasks (building_id);
