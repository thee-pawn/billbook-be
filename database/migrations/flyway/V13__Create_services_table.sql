-- Create services table
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    reminder INTEGER,
    category VARCHAR(100),
    description TEXT,
    gender VARCHAR(20),
    price DECIMAL(10,2),
    duration INTEGER,
    tax_prcnt DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_services_name ON services(name);
CREATE INDEX idx_services_category ON services(category);
CREATE INDEX idx_services_gender ON services(gender);
CREATE INDEX idx_services_price ON services(price);

-- Add comment to table
COMMENT ON TABLE services IS 'Table to store service information with pricing and duration details';

-- Add comments to specific columns for clarity
COMMENT ON COLUMN services.reminder IS 'Reminder days before service (nullable)';
COMMENT ON COLUMN services.duration IS 'Service duration in minutes';
COMMENT ON COLUMN services.tax_prcnt IS 'Tax percentage for the service';
COMMENT ON COLUMN services.gender IS 'Target gender for the service (e.g., Male, Female, Unisex)';
