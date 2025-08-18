-- Add status field to services table
-- Status can be 'active' or 'inactive', defaults to 'active'

ALTER TABLE services 
ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'active' 
CHECK (status IN ('active', 'inactive'));

-- Add index for better query performance
CREATE INDEX idx_services_status ON services(status);

-- Update existing services to have 'active' status (they are already active by default)
UPDATE services SET status = 'active' WHERE status IS NULL;
