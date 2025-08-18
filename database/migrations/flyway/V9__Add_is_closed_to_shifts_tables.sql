-- Add is_closed field to shifts table
ALTER TABLE shifts 
ADD COLUMN is_closed BOOLEAN NOT NULL DEFAULT FALSE;

-- Add is_closed field to special_shifts table  
ALTER TABLE special_shifts 
ADD COLUMN is_closed BOOLEAN NOT NULL DEFAULT FALSE;

-- Add comment for clarity
COMMENT ON COLUMN shifts.is_closed IS 'Indicates if the store is closed on this day';
COMMENT ON COLUMN special_shifts.is_closed IS 'Indicates if the store is closed on this specific date';
