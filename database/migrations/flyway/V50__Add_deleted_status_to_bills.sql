-- V50: Add deleted status to bills table and related fields

-- Drop the existing CHECK constraint
ALTER TABLE bills DROP CONSTRAINT bills_status_check;

-- Add the new CHECK constraint with 'deleted' status
ALTER TABLE bills ADD CONSTRAINT bills_status_check
CHECK (status IN ('paid', 'partial', 'unpaid', 'deleted'));

-- Add deleted_at and deleted_by columns for audit trail
ALTER TABLE bills ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE bills ADD COLUMN deleted_by UUID REFERENCES users(id);

-- Create index for deleted status queries
CREATE INDEX idx_bills_deleted_at ON bills(deleted_at);

-- Update the comment to reflect new status options
COMMENT ON COLUMN bills.status IS 'Payment status: paid, partial, unpaid, deleted';
COMMENT ON COLUMN bills.deleted_at IS 'Timestamp when bill was soft deleted';
COMMENT ON COLUMN bills.deleted_by IS 'User who soft deleted the bill';
