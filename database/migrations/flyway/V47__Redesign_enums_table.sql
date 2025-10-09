-- Drop the existing store_enums table and recreate with proper structure
DROP TABLE IF EXISTS store_enums;

-- Create new enums table with proper structure
CREATE TABLE enums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,
    type VARCHAR(100) NOT NULL,
    values TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    UNIQUE(store_id, type)
);

-- Create indexes for better performance
CREATE INDEX idx_enums_store_id ON enums(store_id);
CREATE INDEX idx_enums_type ON enums(type);
CREATE INDEX idx_enums_store_type ON enums(store_id, type);

-- Add comment to table
COMMENT ON TABLE enums IS 'Table to store store-specific enumeration values with flexible types and array values';

-- Add comments to columns for clarity
COMMENT ON COLUMN enums.type IS 'Type of enum (e.g., serviceCategory, productCategory, roles)';
COMMENT ON COLUMN enums.values IS 'Array of string values for this enum type';
