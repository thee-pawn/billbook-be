-- V50 Add 'billed' value to appointments.status check constraint
-- Drops the existing constraint (if any) and re-creates it including the new value.

BEGIN;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_status;

ALTER TABLE appointments
  ADD CONSTRAINT chk_appointments_status
  CHECK (status IN ('scheduled','in-progress','completed','cancelled','billed'));

COMMIT;
