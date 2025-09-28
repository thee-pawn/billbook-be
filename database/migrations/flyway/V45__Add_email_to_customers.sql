-- Add email column to customers table
-- This allows storing customer email addresses for billing and communication

ALTER TABLE customers ADD COLUMN email VARCHAR(255);

-- Add index for email lookups (optional but useful for performance)
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email) WHERE email IS NOT NULL;

-- Add comment
COMMENT ON COLUMN customers.email IS 'Customer email address for communication and billing';