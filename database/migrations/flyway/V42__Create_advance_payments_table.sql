-- V42: Create advance payments tracking table
-- This table provides a comprehensive view of all advance payments across appointments, bookings, and enquiries

CREATE TABLE IF NOT EXISTS advance_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    
    -- Reference to the original transaction
    reference_type VARCHAR(20) NOT NULL CHECK (reference_type IN ('appointment', 'booking', 'enquiry', 'direct')),
    reference_id UUID, -- Can be NULL for direct payments
    
    -- Payment details
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    payment_mode VARCHAR(20) NOT NULL CHECK (payment_mode IN ('cash', 'card', 'upi', 'wallet', 'bank_transfer')),
    payment_reference VARCHAR(255), -- Transaction reference from payment gateway
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'utilized', 'refunded', 'expired')),
    utilized_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    remaining_amount DECIMAL(12,2) NOT NULL,
    
    -- Metadata
    notes TEXT,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure remaining amount is consistent
    CONSTRAINT chk_remaining_amount CHECK (remaining_amount = amount - utilized_amount),
    CONSTRAINT chk_utilized_amount CHECK (utilized_amount >= 0 AND utilized_amount <= amount)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_advance_payments_store_id ON advance_payments(store_id);
CREATE INDEX IF NOT EXISTS idx_advance_payments_customer_id ON advance_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_advance_payments_reference ON advance_payments(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_advance_payments_status ON advance_payments(status);
CREATE INDEX IF NOT EXISTS idx_advance_payments_payment_date ON advance_payments(payment_date);

-- Table for tracking advance payment utilization in bills
CREATE TABLE IF NOT EXISTS advance_payment_utilizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advance_payment_id UUID NOT NULL REFERENCES advance_payments(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    utilized_amount DECIMAL(12,2) NOT NULL CHECK (utilized_amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure no duplicate utilization for same bill and advance payment
    UNIQUE(advance_payment_id, bill_id)
);

-- Indexes for utilization tracking
CREATE INDEX IF NOT EXISTS idx_advance_utilizations_advance_payment ON advance_payment_utilizations(advance_payment_id);
CREATE INDEX IF NOT EXISTS idx_advance_utilizations_bill_id ON advance_payment_utilizations(bill_id);

-- Function to automatically update remaining amount when utilizations change
CREATE OR REPLACE FUNCTION update_advance_payment_remaining()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the advance payment's utilized and remaining amounts
    UPDATE advance_payments 
    SET 
        utilized_amount = (
            SELECT COALESCE(SUM(utilized_amount), 0) 
            FROM advance_payment_utilizations 
            WHERE advance_payment_id = COALESCE(NEW.advance_payment_id, OLD.advance_payment_id)
        ),
        remaining_amount = amount - (
            SELECT COALESCE(SUM(utilized_amount), 0) 
            FROM advance_payment_utilizations 
            WHERE advance_payment_id = COALESCE(NEW.advance_payment_id, OLD.advance_payment_id)
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = COALESCE(NEW.advance_payment_id, OLD.advance_payment_id);
    
    -- Update status based on remaining amount
    UPDATE advance_payments 
    SET status = CASE 
        WHEN remaining_amount <= 0 THEN 'utilized'
        ELSE 'active'
    END
    WHERE id = COALESCE(NEW.advance_payment_id, OLD.advance_payment_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically update remaining amounts
CREATE TRIGGER trigger_update_advance_remaining_insert
    AFTER INSERT ON advance_payment_utilizations
    FOR EACH ROW
    EXECUTE FUNCTION update_advance_payment_remaining();

CREATE TRIGGER trigger_update_advance_remaining_update
    AFTER UPDATE ON advance_payment_utilizations
    FOR EACH ROW
    EXECUTE FUNCTION update_advance_payment_remaining();

CREATE TRIGGER trigger_update_advance_remaining_delete
    AFTER DELETE ON advance_payment_utilizations
    FOR EACH ROW
    EXECUTE FUNCTION update_advance_payment_remaining();

-- Comments for documentation
COMMENT ON TABLE advance_payments IS 'Tracks all advance payments made by customers for appointments, bookings, and direct payments';
COMMENT ON TABLE advance_payment_utilizations IS 'Tracks how advance payments are utilized in billing transactions';
COMMENT ON COLUMN advance_payments.reference_type IS 'Type of transaction that generated this advance payment';
COMMENT ON COLUMN advance_payments.reference_id IS 'ID of the appointment, booking, or enquiry that generated this payment';
COMMENT ON COLUMN advance_payments.remaining_amount IS 'Amount still available for use in future bills';
COMMENT ON COLUMN advance_payments.utilized_amount IS 'Total amount already used in bills';