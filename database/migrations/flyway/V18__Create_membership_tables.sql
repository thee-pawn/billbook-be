-- Create membership tables to store complex membership structures
-- Main memberships table with basic information

CREATE TABLE memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    wallet_balance DECIMAL(10,2) DEFAULT 0.00,
    validity_years INTEGER DEFAULT 0,
    validity_months INTEGER DEFAULT 0,
    validity_days INTEGER DEFAULT 0,
    overall_discount_type VARCHAR(20) CHECK (overall_discount_type IN ('percentage', 'fixed')),
    overall_discount_value DECIMAL(10,2) DEFAULT 0.00,
    service_discount_type VARCHAR(20) CHECK (service_discount_type IN ('percentage', 'fixed')),
    service_discount_value DECIMAL(10,2) DEFAULT 0.00,
    service_include_all BOOLEAN DEFAULT false,
    product_discount_type VARCHAR(20) CHECK (product_discount_type IN ('percentage', 'fixed')),
    product_discount_value DECIMAL(10,2) DEFAULT 0.00,
    product_include_all BOOLEAN DEFAULT false,
    service_package_id UUID,
    loyalty_one_time_bonus INTEGER DEFAULT 0,
    loyalty_service_multiplier DECIMAL(3,2) DEFAULT 1.00,
    loyalty_product_multiplier DECIMAL(3,2) DEFAULT 1.00,
    loyalty_membership_multiplier DECIMAL(3,2) DEFAULT 1.00,
    status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Table to store included services for service discount
CREATE TABLE membership_service_inclusions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id UUID NOT NULL,
    service_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    UNIQUE(membership_id, service_id)
);

-- Table to store excluded services for service discount
CREATE TABLE membership_service_exclusions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id UUID NOT NULL,
    service_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    UNIQUE(membership_id, service_id)
);

-- Table to store included products for product discount
CREATE TABLE membership_product_inclusions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id UUID NOT NULL,
    product_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(membership_id, product_id)
);

-- Table to store excluded products for product discount  
CREATE TABLE membership_product_exclusions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id UUID NOT NULL,
    product_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(membership_id, product_id)
);

-- Table to store service packages included in membership
CREATE TABLE membership_service_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id UUID NOT NULL,
    service_id UUID NOT NULL,
    quantity_type VARCHAR(20) NOT NULL CHECK (quantity_type IN ('sessions', 'hours', 'minutes')),
    quantity_value INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    UNIQUE(membership_id, service_id)
);

-- Create indexes for better performance
CREATE INDEX idx_memberships_store_id ON memberships(store_id);
CREATE INDEX idx_memberships_status ON memberships(status);
CREATE INDEX idx_memberships_name ON memberships(name);
CREATE INDEX idx_memberships_price ON memberships(price);
CREATE INDEX idx_membership_service_inclusions_membership_id ON membership_service_inclusions(membership_id);
CREATE INDEX idx_membership_service_exclusions_membership_id ON membership_service_exclusions(membership_id);
CREATE INDEX idx_membership_product_inclusions_membership_id ON membership_product_inclusions(membership_id);
CREATE INDEX idx_membership_product_exclusions_membership_id ON membership_product_exclusions(membership_id);
CREATE INDEX idx_membership_service_packages_membership_id ON membership_service_packages(membership_id);

-- Add comments for documentation
COMMENT ON TABLE memberships IS 'Store membership plans with pricing, discounts, and benefits';
COMMENT ON TABLE membership_service_inclusions IS 'Services included in membership service discounts';
COMMENT ON TABLE membership_service_exclusions IS 'Services excluded from membership service discounts';
COMMENT ON TABLE membership_product_inclusions IS 'Products included in membership product discounts';
COMMENT ON TABLE membership_product_exclusions IS 'Products excluded from membership product discounts';
COMMENT ON TABLE membership_service_packages IS 'Service packages included in membership with quantity allocations';

COMMENT ON COLUMN memberships.validity_years IS 'Membership validity period - years component';
COMMENT ON COLUMN memberships.validity_months IS 'Membership validity period - months component';
COMMENT ON COLUMN memberships.validity_days IS 'Membership validity period - days component';
COMMENT ON COLUMN memberships.wallet_balance IS 'Initial wallet balance credited with membership';
COMMENT ON COLUMN memberships.service_include_all IS 'Whether to include all services in discount (true) or only specified ones (false)';
COMMENT ON COLUMN memberships.product_include_all IS 'Whether to include all products in discount (true) or only specified ones (false)';
COMMENT ON COLUMN memberships.loyalty_one_time_bonus IS 'One-time loyalty points bonus when membership is purchased';
COMMENT ON COLUMN membership_service_packages.quantity_type IS 'Type of quantity allocation - sessions, hours, or minutes';
COMMENT ON COLUMN membership_service_packages.quantity_value IS 'Number of sessions/hours/minutes allocated for the service';
