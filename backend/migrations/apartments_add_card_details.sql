-- Add owner / management-company / attorneys / equipment / notes detail fields
-- to the apartment card (building reception desk). All fields are nullable so
-- existing apartments remain valid without back-filling.

ALTER TABLE apartments
    ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS owner_phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS management_company_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS management_company_phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS attorneys TEXT,
    ADD COLUMN IF NOT EXISTS equipment TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT;
