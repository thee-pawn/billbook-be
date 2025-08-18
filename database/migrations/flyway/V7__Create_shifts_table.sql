-- Create shifts table for regular store operating hours
CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day VARCHAR(20) NOT NULL,
    opening_time VARCHAR(10),
    closing_time VARCHAR(10),
    is_24_hrs_open BOOLEAN DEFAULT FALSE,
    store_id UUID NOT NULL,
    created_on TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_on TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key constraint
    CONSTRAINT fk_shifts_store_id 
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    
    -- Unique constraint to prevent duplicate day entries for same store
    CONSTRAINT uk_shifts_store_day 
        UNIQUE (store_id, day),
    
    -- Check constraint for valid days
    CONSTRAINT chk_shifts_day 
        CHECK (day IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
    
    -- Check constraint for time format (HH:MM)
    CONSTRAINT chk_shifts_opening_time 
        CHECK (opening_time IS NULL OR opening_time ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT chk_shifts_closing_time 
        CHECK (closing_time IS NULL OR closing_time ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$')
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_shifts_store_id ON shifts(store_id);
CREATE INDEX IF NOT EXISTS idx_shifts_day ON shifts(day);
CREATE INDEX IF NOT EXISTS idx_shifts_store_day ON shifts(store_id, day);

-- Create trigger to automatically update updated_on timestamp
CREATE OR REPLACE FUNCTION update_shifts_updated_on()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_on = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_shifts_updated_on
    BEFORE UPDATE ON shifts
    FOR EACH ROW
    EXECUTE FUNCTION update_shifts_updated_on();

-- Add comments for documentation
COMMENT ON TABLE shifts IS 'Regular operating hours for stores by day of the week';
COMMENT ON COLUMN shifts.day IS 'Day of the week (monday, tuesday, etc.)';
COMMENT ON COLUMN shifts.opening_time IS 'Store opening time in HH:MM format (24-hour)';
COMMENT ON COLUMN shifts.closing_time IS 'Store closing time in HH:MM format (24-hour)';
COMMENT ON COLUMN shifts.is_24_hrs_open IS 'Whether the store is open 24 hours on this day';
COMMENT ON COLUMN shifts.store_id IS 'Reference to the store this shift belongs to';
