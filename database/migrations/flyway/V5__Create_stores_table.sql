-- Create stores table
CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    mobile_no VARCHAR(20),
    whatsapp_no VARCHAR(20),
    contact_email_id VARCHAR(255),
    reporting_email_id VARCHAR(255),
    gst_number VARCHAR(50),
    tax_billing VARCHAR(100),
    business_category VARCHAR(100),
    instagram_link VARCHAR(500),
    facebook_link VARCHAR(500),
    google_maps_link VARCHAR(500),
    address_line_1 TEXT,
    locality VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    pincode VARCHAR(20),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_on TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_on TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stores_name ON stores(name);
CREATE INDEX IF NOT EXISTS idx_stores_mobile_no ON stores(mobile_no);
CREATE INDEX IF NOT EXISTS idx_stores_gst_number ON stores(gst_number);
CREATE INDEX IF NOT EXISTS idx_stores_city ON stores(city);
CREATE INDEX IF NOT EXISTS idx_stores_created_on ON stores(created_on);

-- Create trigger to automatically update updated_on timestamp
CREATE OR REPLACE FUNCTION update_stores_updated_on()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_on = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stores_updated_on
    BEFORE UPDATE ON stores
    FOR EACH ROW
    EXECUTE FUNCTION update_stores_updated_on();
