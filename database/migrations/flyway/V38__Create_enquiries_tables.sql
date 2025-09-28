-- Create enquiries and enquiry_details tables
-- Enums enforced via CHECK constraints

CREATE TABLE IF NOT EXISTS enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID NULL REFERENCES customers(id) ON DELETE SET NULL,
  contact_no VARCHAR(20) NOT NULL,
  country_code VARCHAR(10) NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255),
  gender VARCHAR(10) CHECK (gender IN ('male','female','other')) NOT NULL,
  source VARCHAR(50) CHECK (source IN ('walk-in','instagram','facebook','cold-calling','website','client-reference')) NOT NULL,
  enquiry_type VARCHAR(10) CHECK (enquiry_type IN ('hot','cold','warm')) NOT NULL,
  enquiry_status VARCHAR(20) CHECK (enquiry_status IN ('pending','converted','closed')) NOT NULL,
  notes TEXT,
  follow_up_at TIMESTAMPTZ NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_contact_no_digits CHECK (contact_no ~ '^[0-9]{10}$'),
  CONSTRAINT chk_country_code_format CHECK (country_code ~ '^\+[0-9]+$')
);

CREATE INDEX IF NOT EXISTS idx_enquiries_store_id ON enquiries(store_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(enquiry_status);
CREATE INDEX IF NOT EXISTS idx_enquiries_type ON enquiries(enquiry_type);
CREATE INDEX IF NOT EXISTS idx_enquiries_source ON enquiries(source);
CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON enquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_enquiries_follow_up_at ON enquiries(follow_up_at);
CREATE INDEX IF NOT EXISTS idx_enquiries_deleted_at ON enquiries(deleted_at);
CREATE INDEX IF NOT EXISTS idx_enquiries_contact ON enquiries(contact_no);

COMMENT ON TABLE enquiries IS 'Leads/Enquiries captured for a store';

-- Details table
CREATE TABLE IF NOT EXISTS enquiry_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  category VARCHAR(30) NOT NULL CHECK (category IN ('service','product','membership-package')),
  name VARCHAR(255) NOT NULL,
  reference_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_enquiry_details_enquiry_id ON enquiry_details(enquiry_id);

COMMENT ON TABLE enquiry_details IS 'Items/details referenced in an enquiry';
