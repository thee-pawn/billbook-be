-- Create service packages table to store service package configurations
-- Service packages allow bundling multiple services with different pricing and validity

CREATE TABLE service_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,
    package_name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    validity_years INTEGER DEFAULT 0,
    validity_months INTEGER DEFAULT 0,
    validity_days INTEGER DEFAULT 0,
    status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Table to store services included in a package
-- Supports both "included" services and "discount" services with different configurations
CREATE TABLE service_package_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL,
    service_id UUID NOT NULL,
    quantity_type VARCHAR(20) NOT NULL CHECK (quantity_type IN ('Hours', 'Minutes', 'serviceCount', 'sessions')),
    qty INTEGER NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('included', 'discount')),
    discount_value DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (package_id) REFERENCES service_packages(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    UNIQUE(package_id, service_id)
);

-- Create indexes for better performance
CREATE INDEX idx_service_packages_store_id ON service_packages(store_id);
CREATE INDEX idx_service_packages_status ON service_packages(status);
CREATE INDEX idx_service_packages_name ON service_packages(package_name);
CREATE INDEX idx_service_packages_price ON service_packages(price);
CREATE INDEX idx_service_package_items_package_id ON service_package_items(package_id);
CREATE INDEX idx_service_package_items_service_id ON service_package_items(service_id);
CREATE INDEX idx_service_package_items_type ON service_package_items(type);

-- Add comments for documentation
COMMENT ON TABLE service_packages IS 'Service packages that bundle multiple services with custom pricing and validity';
COMMENT ON TABLE service_package_items IS 'Individual services included in a package with quantity and discount configurations';

COMMENT ON COLUMN service_packages.validity_years IS 'Package validity period - years component';
COMMENT ON COLUMN service_packages.validity_months IS 'Package validity period - months component';
COMMENT ON COLUMN service_packages.validity_days IS 'Package validity period - days component';
COMMENT ON COLUMN service_package_items.quantity_type IS 'Type of quantity - Hours, Minutes, serviceCount, or sessions';
COMMENT ON COLUMN service_package_items.qty IS 'Quantity allocated for this service';
COMMENT ON COLUMN service_package_items.type IS 'Service type - included (bundled) or discount (discounted rate)';
COMMENT ON COLUMN service_package_items.discount_value IS 'Discount percentage or amount for discount type services';
