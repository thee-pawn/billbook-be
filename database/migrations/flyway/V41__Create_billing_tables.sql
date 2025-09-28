-- V41: Create billing tables

-- Main bills table for finalized bills
CREATE TABLE bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) NOT NULL,
    coupon_code VARCHAR(100),
    coupon_codes TEXT[], -- Array of all applied coupon codes
    referral_code VARCHAR(100),
    sub_total DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    cgst_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    sgst_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    grand_total DECIMAL(10,2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    dues DECIMAL(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'partial', 'unpaid')),
    payment_mode VARCHAR(20) NOT NULL CHECK (payment_mode IN ('cash', 'card', 'upi', 'wallet', 'split', 'none')),
    payment_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    billing_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    payment_timestamp TIMESTAMP WITH TIME ZONE,
    idempotency_key VARCHAR(255),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(store_id, invoice_number),
    UNIQUE(idempotency_key) -- Global uniqueness for idempotency
);

-- Bill items table
CREATE TABLE bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('service', 'product', 'membership')),
    catalog_id UUID NOT NULL, -- References services/products/memberships
    name VARCHAR(255) NOT NULL,
    staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    qty INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1),
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent', 'flat')),
    discount_value DECIMAL(10,2) NOT NULL DEFAULT 0,
    cgst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
    sgst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
    base_amount DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    cgst_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    sgst_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    line_total DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(bill_id, line_no)
);

-- Bill payments table
CREATE TABLE bill_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('cash', 'card', 'upi', 'wallet')),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    reference VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Held bills table for draft bills
CREATE TABLE held_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    payload JSONB NOT NULL, -- Store original request payload
    customer_summary VARCHAR(500), -- For quick display
    amount_estimate DECIMAL(10,2), -- Estimated total for quick display
    idempotency_key VARCHAR(255),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(idempotency_key) -- Global uniqueness for idempotency
);

-- Indexes for performance
CREATE INDEX idx_bills_store_id ON bills(store_id);
CREATE INDEX idx_bills_customer_id ON bills(customer_id);
CREATE INDEX idx_bills_invoice_number ON bills(store_id, invoice_number);
CREATE INDEX idx_bills_billing_timestamp ON bills(billing_timestamp);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_bills_idempotency_key ON bills(idempotency_key);

CREATE INDEX idx_bill_items_bill_id ON bill_items(bill_id);
CREATE INDEX idx_bill_items_catalog ON bill_items(type, catalog_id);

CREATE INDEX idx_bill_payments_bill_id ON bill_payments(bill_id);

CREATE INDEX idx_held_bills_store_id ON held_bills(store_id);
CREATE INDEX idx_held_bills_created_at ON held_bills(created_at);
CREATE INDEX idx_held_bills_idempotency_key ON held_bills(idempotency_key);

-- Comments
COMMENT ON TABLE bills IS 'Finalized bills with invoice numbers';
COMMENT ON TABLE bill_items IS 'Line items for bills with computed amounts';
COMMENT ON TABLE bill_payments IS 'Payment records for bills';
COMMENT ON TABLE held_bills IS 'Draft bills on hold without invoice numbers';
COMMENT ON COLUMN bills.status IS 'Payment status: paid, partial, unpaid';
COMMENT ON COLUMN held_bills.payload IS 'Original request payload as JSON';
