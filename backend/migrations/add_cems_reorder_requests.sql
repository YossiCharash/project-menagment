-- Migration: Create cems_reorder_requests table for consumable reorder lifecycle tracking
-- Date: 2026-03-23

-- Enum type (idempotent)
DO $$ BEGIN
    CREATE TYPE cems_reorder_status AS ENUM ('PENDING','ORDERED','RECEIVED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS cems_reorder_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES cems_consumable_items(id) ON DELETE CASCADE,
    requested_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    quantity_requested NUMERIC(10,4) NOT NULL,
    supplier VARCHAR(255),
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ordered_at TIMESTAMP,
    received_at TIMESTAMP,
    received_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    quantity_received NUMERIC(10,4)
);

CREATE INDEX IF NOT EXISTS ix_cems_reorder_requests_item_id ON cems_reorder_requests(item_id);
CREATE INDEX IF NOT EXISTS ix_cems_reorder_requests_status ON cems_reorder_requests(status);
