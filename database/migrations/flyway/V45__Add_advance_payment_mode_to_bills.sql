-- Add 'advance' as a valid payment mode in bills table payment_mode field
-- Update the check constraint to be consistent with validation schema

ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_payment_mode_check;

ALTER TABLE bills ADD CONSTRAINT bills_payment_mode_check 
CHECK (payment_mode IN ('cash', 'card', 'upi', 'wallet', 'advance', 'split', 'none'));

-- Add comment to clarify the advance payment mode
COMMENT ON COLUMN bills.payment_mode IS 'Primary payment mode for the bill: cash, card, upi, wallet, advance, split (multiple modes), or none (unpaid)';