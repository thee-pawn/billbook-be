-- V21: Create coupons tables
-- This migration creates tables to store coupon information and their inclusions/exclusions

-- Main coupons table
CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    coupon_code VARCHAR(100) NOT NULL,
    description TEXT,
    valid_from DATE NOT NULL,
    valid_till DATE NOT NULL,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
    discount_value DECIMAL(10,2) NOT NULL,
    minimum_spend DECIMAL(10,2) DEFAULT 0,
    maximum_discount DECIMAL(10,2),
    usage_limit INTEGER DEFAULT 1,
    limit_refresh_days INTEGER DEFAULT 30,
    services_all_included BOOLEAN DEFAULT false,
    products_all_included BOOLEAN DEFAULT false,
    memberships_all_included BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique coupon codes per store
    UNIQUE(store_id, coupon_code)
);

-- Coupon service inclusions table
CREATE TABLE coupon_service_inclusions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure no duplicate inclusions
    UNIQUE(coupon_id, service_id)
);

-- Coupon product inclusions table
CREATE TABLE coupon_product_inclusions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure no duplicate inclusions
    UNIQUE(coupon_id, product_id)
);

-- Coupon membership inclusions table
CREATE TABLE coupon_membership_inclusions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure no duplicate inclusions
    UNIQUE(coupon_id, membership_id)
);

-- Coupon usage tracking table
CREATE TABLE coupon_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    usage_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    order_amount DECIMAL(10,2),
    discount_applied DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_coupons_store_id ON coupons(store_id);
CREATE INDEX idx_coupons_coupon_code ON coupons(coupon_code);
CREATE INDEX idx_coupons_valid_dates ON coupons(valid_from, valid_till);
CREATE INDEX idx_coupons_status ON coupons(status);
CREATE INDEX idx_coupon_service_inclusions_coupon_id ON coupon_service_inclusions(coupon_id);
CREATE INDEX idx_coupon_product_inclusions_coupon_id ON coupon_product_inclusions(coupon_id);
CREATE INDEX idx_coupon_membership_inclusions_coupon_id ON coupon_membership_inclusions(coupon_id);
CREATE INDEX idx_coupon_usage_coupon_id ON coupon_usage(coupon_id);
CREATE INDEX idx_coupon_usage_user_id ON coupon_usage(user_id);

-- Add comments for documentation
COMMENT ON TABLE coupons IS 'Stores coupon information with discount details and conditions';
COMMENT ON COLUMN coupons.coupon_code IS 'Unique coupon code within a store';
COMMENT ON COLUMN coupons.discount_type IS 'Type of discount: fixed amount or percentage';
COMMENT ON COLUMN coupons.discount_value IS 'Discount amount (fixed value) or percentage (0-100)';
COMMENT ON COLUMN coupons.minimum_spend IS 'Minimum order amount required to use coupon';
COMMENT ON COLUMN coupons.maximum_discount IS 'Maximum discount amount for percentage coupons';
COMMENT ON COLUMN coupons.usage_limit IS 'Maximum number of times coupon can be used per user';
COMMENT ON COLUMN coupons.limit_refresh_days IS 'Days after which usage limit resets for a user';

COMMENT ON TABLE coupon_service_inclusions IS 'Services included in coupon applicability';
COMMENT ON TABLE coupon_product_inclusions IS 'Products included in coupon applicability';
COMMENT ON TABLE coupon_membership_inclusions IS 'Memberships included in coupon applicability';
COMMENT ON TABLE coupon_usage IS 'Tracks coupon usage history for limit enforcement';
