-- Persist the original uploaded filename on documents so the UI can show a
-- human-readable name instead of the uuid-based S3 key. Nullable so existing
-- rows (which only stored the S3 key) remain valid without back-filling.

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
