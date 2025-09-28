-- V37 Normalize appointment status values
-- Update any legacy values to new set: scheduled, in-progress, completed, cancelled
UPDATE appointments SET status = 'scheduled' WHERE status IN ('scheduled') OR status IS NULL;
UPDATE appointments SET status = 'in-progress' WHERE status IN ('confirmed','in_progress');
UPDATE appointments SET status = 'completed' WHERE status IN ('completed');
UPDATE appointments SET status = 'cancelled' WHERE status IN ('cancelled','canceled','no_show');

-- Optional: add a check constraint to enforce allowed values
ALTER TABLE appointments
    ADD CONSTRAINT chk_appointments_status
    CHECK (status IN ('scheduled','in-progress','completed','cancelled'));
