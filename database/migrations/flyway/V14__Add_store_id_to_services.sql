-- Add store_id column to services table
ALTER TABLE services 
ADD COLUMN store_id UUID NOT NULL;

-- Add foreign key constraint
ALTER TABLE services 
ADD CONSTRAINT fk_services_store_id 
FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

-- Create index for better performance on store_id
CREATE INDEX idx_services_store_id ON services(store_id);

-- Add comment to the new column
COMMENT ON COLUMN services.store_id IS 'Foreign key reference to stores table';
