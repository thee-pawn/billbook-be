-- V22: Create customers and related tables
-- This migration creates customers table and related association tables

-- Main customers table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
    birthday VARCHAR(5), -- Format: DD/MM
    anniversary VARCHAR(5), -- Format: DD/MM  
    address TEXT,
    loyalty_points INTEGER DEFAULT 0,
    wallet_balance DECIMAL(10,2) DEFAULT 0.00,
    dues DECIMAL(10,2) DEFAULT 0.00,
    advance_amount DECIMAL(10,2) DEFAULT 0.00,
    last_visit TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    referral_code VARCHAR(8) NOT NULL UNIQUE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique phone number per store
    UNIQUE(store_id, phone_number)
);

-- Customer memberships association table
CREATE TABLE membership_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    purchased_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_from DATE NOT NULL,
    valid_till DATE NOT NULL,
    remaining_services JSONB, -- Track remaining services from membership
    remaining_products JSONB, -- Track remaining products from membership
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure no duplicate active memberships
    UNIQUE(customer_id, membership_id, status) DEFERRABLE INITIALLY DEFERRED
);

-- Customer service packages association table
CREATE TABLE service_packages_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    service_package_id UUID NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
    purchased_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_from DATE NOT NULL,
    valid_till DATE NOT NULL,
    remaining_services JSONB, -- Track remaining services from package
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'used', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customer loyalty points history table for tracking
CREATE TABLE customer_loyalty_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    points INTEGER NOT NULL, -- Can be positive (earned) or negative (redeemed)
    transaction_type VARCHAR(50) NOT NULL, -- 'earned_service', 'earned_product', 'earned_membership', 'redeemed', 'adjustment'
    transaction_reference_id UUID, -- Reference to order/transaction
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customer wallet history table for tracking
CREATE TABLE customer_wallet_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL, -- Can be positive (credit) or negative (debit)
    transaction_type VARCHAR(50) NOT NULL, -- 'credit', 'debit', 'refund', 'adjustment'
    transaction_reference_id UUID, -- Reference to order/transaction
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS VARCHAR(8) AS $$
DECLARE
    chars VARCHAR(36) := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    result VARCHAR(8) := '';
    i INTEGER;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    
    -- Check if code already exists, regenerate if needed
    WHILE EXISTS (SELECT 1 FROM customers WHERE referral_code = result) LOOP
        result := '';
        FOR i IN 1..8 LOOP
            result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
        END LOOP;
    END LOOP;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Set default referral code generation
ALTER TABLE customers ALTER COLUMN referral_code SET DEFAULT generate_referral_code();

-- Create indexes for better performance
CREATE INDEX idx_customers_store_id ON customers(store_id);
CREATE INDEX idx_customers_phone_number ON customers(phone_number);
CREATE INDEX idx_customers_referral_code ON customers(referral_code);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_last_visit ON customers(last_visit);

CREATE INDEX idx_membership_customers_customer_id ON membership_customers(customer_id);
CREATE INDEX idx_membership_customers_membership_id ON membership_customers(membership_id);
CREATE INDEX idx_membership_customers_status ON membership_customers(status);
CREATE INDEX idx_membership_customers_validity ON membership_customers(valid_from, valid_till);

CREATE INDEX idx_service_packages_customers_customer_id ON service_packages_customers(customer_id);
CREATE INDEX idx_service_packages_customers_package_id ON service_packages_customers(service_package_id);
CREATE INDEX idx_service_packages_customers_status ON service_packages_customers(status);
CREATE INDEX idx_service_packages_customers_validity ON service_packages_customers(valid_from, valid_till);
CREATE INDEX idx_service_packages_customers_lookup ON service_packages_customers(customer_id, service_package_id);

CREATE INDEX idx_customer_loyalty_history_customer_id ON customer_loyalty_history(customer_id);
CREATE INDEX idx_customer_loyalty_history_created_at ON customer_loyalty_history(created_at);

CREATE INDEX idx_customer_wallet_history_customer_id ON customer_wallet_history(customer_id);
CREATE INDEX idx_customer_wallet_history_created_at ON customer_wallet_history(created_at);

-- Add comments for documentation
COMMENT ON TABLE customers IS 'Stores customer information with loyalty points, wallet balance, and financial tracking';
COMMENT ON COLUMN customers.phone_number IS 'Customer phone number, unique per store';
COMMENT ON COLUMN customers.birthday IS 'Birthday in DD/MM format without year';
COMMENT ON COLUMN customers.anniversary IS 'Anniversary in DD/MM format without year';
COMMENT ON COLUMN customers.referral_code IS 'Unique 8-character alphanumeric referral code';
COMMENT ON COLUMN customers.loyalty_points IS 'Current loyalty points balance';
COMMENT ON COLUMN customers.wallet_balance IS 'Current wallet balance amount';
COMMENT ON COLUMN customers.dues IS 'Outstanding dues amount';
COMMENT ON COLUMN customers.advance_amount IS 'Advance payment amount';
COMMENT ON COLUMN customers.last_visit IS 'Last visit timestamp, updated during billing';

COMMENT ON TABLE membership_customers IS 'Associates customers with their purchased memberships';
COMMENT ON COLUMN membership_customers.remaining_services IS 'JSON tracking remaining services from membership';
COMMENT ON COLUMN membership_customers.remaining_products IS 'JSON tracking remaining products from membership';

COMMENT ON TABLE service_packages_customers IS 'Associates customers with their purchased service packages';
COMMENT ON COLUMN service_packages_customers.remaining_services IS 'JSON tracking remaining services from package';

COMMENT ON TABLE customer_loyalty_history IS 'Tracks all loyalty points transactions for customers';
COMMENT ON TABLE customer_wallet_history IS 'Tracks all wallet transactions for customers';
