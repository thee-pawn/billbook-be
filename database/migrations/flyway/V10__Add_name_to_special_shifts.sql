-- Add name field to special_shifts table
-- Migration: V10__Add_name_to_special_shifts.sql

ALTER TABLE special_shifts 
ADD COLUMN name VARCHAR(255);

-- Add a comment explaining the purpose of the name field
COMMENT ON COLUMN special_shifts.name IS 'Optional name/description for the special shift (e.g., "Christmas Day", "New Year", "Black Friday", etc.)';
