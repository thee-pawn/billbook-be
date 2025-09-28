-- V36 Ensure status column exists on appointments
ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'scheduled';

-- Optional: ensure helpful index exists for store+status queries
CREATE INDEX IF NOT EXISTS idx_appointments_store_status ON appointments(store_id, status);
