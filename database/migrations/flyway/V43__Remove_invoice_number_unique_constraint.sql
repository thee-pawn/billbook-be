-- Remove unique constraint on store_id and invoice_number
-- The primary key should be the UUID of the bill, not based on invoice number

ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_store_id_invoice_number_key;

-- Add comment to clarify why duplicate invoice numbers might exist
COMMENT ON COLUMN bills.invoice_number IS 'Invoice display number, not required to be unique due to potential race conditions';