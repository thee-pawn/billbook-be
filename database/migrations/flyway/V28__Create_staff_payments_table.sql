-- Create staff_payments table
CREATE TABLE staff_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- User who processed the payment
    payment_period_from DATE NOT NULL,
    payment_period_to DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    account_number VARCHAR(20),
    ifsc_code VARCHAR(11),
    payment_breakdown JSONB NOT NULL,
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
    payment_method VARCHAR(50), -- 'bank_transfer', 'cash', 'cheque', etc.
    payment_reference VARCHAR(255), -- Transaction ID, cheque number, etc.
    payment_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_staff_payments_staff_id ON staff_payments(staff_id);
CREATE INDEX idx_staff_payments_store_id ON staff_payments(store_id);
CREATE INDEX idx_staff_payments_user_id ON staff_payments(user_id);
CREATE INDEX idx_staff_payments_payment_period ON staff_payments(payment_period_from, payment_period_to);
CREATE INDEX idx_staff_payments_status ON staff_payments(payment_status);
CREATE INDEX idx_staff_payments_payment_date ON staff_payments(payment_date);
CREATE INDEX idx_staff_payments_created_at ON staff_payments(created_at);

-- Create unique constraint to prevent duplicate payments for same period
CREATE UNIQUE INDEX idx_staff_payments_unique_period ON staff_payments(staff_id, payment_period_from, payment_period_to) 
WHERE payment_status != 'cancelled';

-- Add comments for documentation
COMMENT ON TABLE staff_payments IS 'Staff salary and commission payments with detailed breakdown';
COMMENT ON COLUMN staff_payments.payment_breakdown IS 'JSON object containing earnings (basic, hra, allowances, commission) and deductions (epf, tax)';
COMMENT ON COLUMN staff_payments.payment_period_from IS 'Start date of the payment period';
COMMENT ON COLUMN staff_payments.payment_period_to IS 'End date of the payment period';
COMMENT ON COLUMN staff_payments.amount IS 'Final payment amount after deductions';
COMMENT ON COLUMN staff_payments.account_number IS 'Bank account number used for this payment';
COMMENT ON COLUMN staff_payments.ifsc_code IS 'IFSC code used for this payment';
COMMENT ON COLUMN staff_payments.payment_reference IS 'External reference like transaction ID or cheque number';
COMMENT ON COLUMN staff_payments.payment_method IS 'Method used for payment (bank_transfer, cash, cheque)';
COMMENT ON COLUMN staff_payments.payment_status IS 'Current status of the payment';
COMMENT ON COLUMN staff_payments.user_id IS 'User who processed/created this payment record';
