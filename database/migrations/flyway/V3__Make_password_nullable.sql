-- Flyway Migration: V3__Make_password_nullable.sql
-- Description: Make password field nullable to support phone-based registration flow
-- Author: Billbook Backend Team
-- Created: 2025-08-01

-- Make password field nullable
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

-- Add a comment to document the change
COMMENT ON COLUMN users.password IS 'Password hash. Can be null during registration until OTP is verified and password is set.';
