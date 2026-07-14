-- Apartment personal area (אזור אישי) for the reception desk apartment card.
-- Adds private detail/notes fields (gated behind the admin password) and the
-- apartment_documents table that stores the personal-area documents. All new
-- columns are nullable so existing apartments remain valid without back-filling.

ALTER TABLE apartments
    ADD COLUMN IF NOT EXISTS private_details TEXT,
    ADD COLUMN IF NOT EXISTS private_notes TEXT;

CREATE TABLE IF NOT EXISTS apartment_documents (
    id SERIAL PRIMARY KEY,
    apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
    file_path VARCHAR(1000) NOT NULL,
    filename VARCHAR(500),
    description TEXT,
    uploaded_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP DEFAULT (now() AT TIME ZONE 'utc')
);

CREATE INDEX IF NOT EXISTS ix_apartment_documents_apartment_id
    ON apartment_documents (apartment_id);
