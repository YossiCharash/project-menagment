-- Create the technician_visits table for the Building Reception Desk.
--
-- Rationale: The reception desk (דלפק הבניין) now records technicians entering
-- an apartment (כניסת טכנאי) and marks when they leave. The TechnicianVisit
-- model declares this table, but the live schema was created via create_all
-- (which never creates tables in an already-provisioned database), so existing
-- databases need the table added by hand. Indexed on apartment_id and status
-- because desk views list visits per apartment and filter by "inside".

CREATE TABLE IF NOT EXISTS technician_visits (
    id SERIAL PRIMARY KEY,
    apartment_id INTEGER NOT NULL REFERENCES apartments(id),
    name VARCHAR(255) NOT NULL,
    role VARCHAR(255),
    phone VARCHAR(64),
    note TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'inside',
    entered_at TIMESTAMP,
    left_at TIMESTAMP,
    created_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_technician_visits_apartment_id ON technician_visits (apartment_id);
CREATE INDEX IF NOT EXISTS ix_technician_visits_status ON technician_visits (status);
