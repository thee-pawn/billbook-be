-- Create store_enums table
CREATE TABLE store_enums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,
    service_category VARCHAR(255),
    product_category VARCHAR(255),
    roles VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_store_enums_store_id ON store_enums(store_id);
CREATE INDEX idx_store_enums_service_category ON store_enums(service_category);
CREATE INDEX idx_store_enums_product_category ON store_enums(product_category);
CREATE INDEX idx_store_enums_roles ON store_enums(roles);

-- Add comment to table
COMMENT ON TABLE store_enums IS 'Table to store store-specific enumeration values for categories and roles';

-- Add comments to columns for clarity
COMMENT ON COLUMN store_enums.service_category IS 'Service category enumeration values for the store';
COMMENT ON COLUMN store_enums.product_category IS 'Product category enumeration values for the store';
COMMENT ON COLUMN store_enums.roles IS 'Custom role enumeration values for the store';
