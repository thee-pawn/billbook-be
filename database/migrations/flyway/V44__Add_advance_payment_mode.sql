-- Add 'advance' as a valid payment mode in bill_payments table
-- Update the check constraint to include advance payments

ALTER TABLE bill_payments DROP CONSTRAINT IF EXISTS bill_payments_mode_check;

ALTER TABLE bill_payments ADD CONSTRAINT bill_payments_mode_check 
CHECK (mode IN ('cash', 'card', 'upi', 'wallet', 'advance'));

-- Add comment to clarify the advance payment mode
COMMENT ON COLUMN bill_payments.mode IS 'Payment mode: cash, card, upi, wallet, or advance (deducted from customer advance balance)';