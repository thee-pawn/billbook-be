-- Add phone_numbers field to receipt_settings table
-- Migration: V30__Add_phone_numbers_to_receipt_settings.sql

ALTER TABLE receipt_settings
ADD COLUMN phone_numbers TEXT;

-- Add comment to explain the new column
COMMENT ON COLUMN receipt_settings.phone_numbers IS 'Comma-separated list of phone numbers for receipt notifications';
