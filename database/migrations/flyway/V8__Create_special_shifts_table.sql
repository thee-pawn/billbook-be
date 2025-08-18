-- Create special_shifts table for store operating hours on specific dates
CREATE TABLE IF NOT EXISTS special_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    opening_time VARCHAR(10),
    closing_time VARCHAR(10),
    is_24_hours_open BOOLEAN DEFAULT FALSE,
    store_id UUID NOT NULL,
    created_on TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_on TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key constraint
    CONSTRAINT fk_special_shifts_store_id 
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    
    -- Unique constraint to prevent duplicate date entries for same store
    CONSTRAINT uk_special_shifts_store_date 
        UNIQUE (store_id, date),
    
    -- Check constraint for time format (HH:MM)
    CONSTRAINT chk_special_shifts_opening_time 
        CHECK (opening_time IS NULL OR opening_time ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT chk_special_shifts_closing_time 
        CHECK (closing_time IS NULL OR closing_time ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$')
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_special_shifts_store_id ON special_shifts(store_id);
CREATE INDEX IF NOT EXISTS idx_special_shifts_date ON special_shifts(date);
CREATE INDEX IF NOT EXISTS idx_special_shifts_store_date ON special_shifts(store_id, date);
CREATE INDEX IF NOT EXISTS idx_special_shifts_date_range ON special_shifts(store_id, date DESC);

-- Create trigger to automatically update updated_on timestamp
CREATE OR REPLACE FUNCTION update_special_shifts_updated_on()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_on = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_special_shifts_updated_on
    BEFORE UPDATE ON special_shifts
    FOR EACH ROW
    EXECUTE FUNCTION update_special_shifts_updated_on();

-- Add comments for documentation
COMMENT ON TABLE special_shifts IS 'Special operating hours for stores on specific dates (holidays, events, etc.)';
COMMENT ON COLUMN special_shifts.date IS 'Specific date for special operating hours';
COMMENT ON COLUMN special_shifts.opening_time IS 'Store opening time in HH:MM format (24-hour)';
COMMENT ON COLUMN special_shifts.closing_time IS 'Store closing time in HH:MM format (24-hour)';
COMMENT ON COLUMN special_shifts.is_24_hours_open IS 'Whether the store is open 24 hours on this date';
COMMENT ON COLUMN special_shifts.store_id IS 'Reference to the store this special shift belongs to';
