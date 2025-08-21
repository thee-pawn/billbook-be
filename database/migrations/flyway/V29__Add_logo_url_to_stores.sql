-- Add logo_url column to stores table
ALTER TABLE stores ADD COLUMN logo_url VARCHAR(500);

-- Create index for logo_url for better performance when filtering by logo existence
CREATE INDEX IF NOT EXISTS idx_stores_logo_url ON stores(logo_url) WHERE logo_url IS NOT NULL;
