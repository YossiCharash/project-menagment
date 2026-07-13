-- Create the client_visits table for the Building Reception Desk.
--
-- Rationale: The reception desk (דלפק הבניין) now records clients arriving at
-- an apartment (הגעת לקוח), with a required arrival time and an optional
-- "until" time. An apartment is occupied (מאוכלסת) while it has a visit with
-- status 'present'; once 'expected_until' passes the visit is auto-flipped to
-- 'left' and the apartment becomes vacant (פנויה). The ClientVisit model
-- declares this table, but the live schema was created via create_all (which
-- never creates tables in an already-provisioned database), so existing
-- databases need the table added by hand. Indexed on apartment_id and status
-- because desk views list visits per apartment and the expiry pass filters by
-- status = 'present'.

CREATE TABLE IF NOT EXISTS client_visits (
    id SERIAL PRIMARY KEY,
    apartment_id INTEGER NOT NULL REFERENCES apartments(id),
    name VARCHAR(255),
    arrived_at TIMESTAMP,
    expected_until TIMESTAMP,
    note TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'present',
    left_at TIMESTAMP,
    created_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_client_visits_apartment_id ON client_visits (apartment_id);
CREATE INDEX IF NOT EXISTS ix_client_visits_status ON client_visits (status);
