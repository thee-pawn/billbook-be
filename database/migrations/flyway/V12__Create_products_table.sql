-- Create products table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    cost_price DECIMAL(10,2),
    selling_price DECIMAL(10,2),
    usage VARCHAR(255),
    category VARCHAR(100),
    qty INTEGER DEFAULT 0,
    prod_qty INTEGER,
    prod_qty_unit VARCHAR(50),
    mfg_date DATE,
    exp_date DATE,
    notification_qty INTEGER DEFAULT 0,
    expiry_notification_days INTEGER DEFAULT 30,
    hsn_sac_code VARCHAR(20),
    tax_prcnt DECIMAL(5,2),
    description TEXT,
    batch_no VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_products_store_id ON products(store_id);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_exp_date ON products(exp_date);
CREATE INDEX idx_products_batch_no ON products(batch_no);

-- Add comment to table
COMMENT ON TABLE products IS 'Table to store product information for each store';
