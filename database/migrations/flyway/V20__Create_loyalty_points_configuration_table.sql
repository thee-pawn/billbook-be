-- V20: Create loyalty points configuration table
-- This table stores loyalty points configuration for each store

CREATE TABLE loyalty_points_configuration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    loyalty_points_conversion_rate INTEGER NOT NULL DEFAULT 100,
    service_loyalty_points INTEGER NOT NULL DEFAULT 0,
    product_loyalty_points INTEGER NOT NULL DEFAULT 0,
    membership_loyalty_points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure only one configuration per store
    UNIQUE(store_id)
);

-- Create index for faster lookups
CREATE INDEX idx_loyalty_points_configuration_store_id ON loyalty_points_configuration(store_id);

-- Add comments for documentation
COMMENT ON TABLE loyalty_points_configuration IS 'Stores loyalty points configuration settings for each store';
COMMENT ON COLUMN loyalty_points_configuration.loyalty_points_conversion_rate IS 'Rate at which loyalty points are converted to currency (e.g., 200 points = 1 currency unit)';
COMMENT ON COLUMN loyalty_points_configuration.service_loyalty_points IS 'Loyalty points awarded per service transaction';
COMMENT ON COLUMN loyalty_points_configuration.product_loyalty_points IS 'Loyalty points awarded per product transaction';
COMMENT ON COLUMN loyalty_points_configuration.membership_loyalty_points IS 'Loyalty points awarded per membership purchase';
