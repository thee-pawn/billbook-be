-- Flyway Migration: V4__Update_status_logged_in_to_active.sql
-- Description: Update any existing LOGGED_IN status to ACTIVE for consistency
-- Author: Billbook Backend Team
-- Created: 2025-08-01

-- Update any existing users with LOGGED_IN status to ACTIVE
UPDATE users 
SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP 
WHERE status = 'LOGGED_IN';

-- Add a comment to document the status values
COMMENT ON COLUMN users.status IS 'User status: OTP_GENERATED (registration started), VERIFIED (OTP verified, password not set), ACTIVE (complete registration with password)';
