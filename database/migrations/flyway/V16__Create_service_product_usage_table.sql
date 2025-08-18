-- Create service_product_usage table
CREATE TABLE service_product_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL,
    product_id UUID NOT NULL,
    qty INTEGER NOT NULL,
    unit VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_service_product_usage_service_id ON service_product_usage(service_id);
CREATE INDEX idx_service_product_usage_product_id ON service_product_usage(product_id);
CREATE INDEX idx_service_product_usage_service_product ON service_product_usage(service_id, product_id);

-- Add unique constraint to prevent duplicate service-product combinations
CREATE UNIQUE INDEX idx_service_product_usage_unique ON service_product_usage(service_id, product_id);

-- Add comment to table
COMMENT ON TABLE service_product_usage IS 'Table to track which products are used in which services and their quantities';

-- Add comments to columns for clarity
COMMENT ON COLUMN service_product_usage.service_id IS 'Foreign key reference to services table';
COMMENT ON COLUMN service_product_usage.product_id IS 'Foreign key reference to products table';
COMMENT ON COLUMN service_product_usage.qty IS 'Quantity of product used in the service';
COMMENT ON COLUMN service_product_usage.unit IS 'Unit of measurement for the quantity (e.g., ml, grams, pieces)';
