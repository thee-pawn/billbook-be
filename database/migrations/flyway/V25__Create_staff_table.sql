-- Create staff table
CREATE TABLE staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    contact VARCHAR(20) NOT NULL,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
    email VARCHAR(255),
    doj DATE NOT NULL, -- Date of joining
    dob DATE, -- Date of birth
    designation VARCHAR(100),
    role VARCHAR(50),
    shifts JSONB, -- Working days, hours etc.
    document_id VARCHAR(255), -- Reference to document stored in S3
    photo_id VARCHAR(255), -- Reference to photo stored in S3
    salary JSONB, -- Salary structure with earnings and deductions
    commission JSONB, -- Commission structure
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_staff_user_id ON staff(user_id);
CREATE INDEX idx_staff_store_id ON staff(store_id);
CREATE INDEX idx_staff_contact ON staff(contact);
CREATE INDEX idx_staff_email ON staff(email);
CREATE INDEX idx_staff_status ON staff(status);

-- Create unique constraint to ensure one staff record per user per store
CREATE UNIQUE INDEX idx_staff_user_store ON staff(user_id, store_id) WHERE status != 'terminated';

-- Add comments for documentation
COMMENT ON TABLE staff IS 'Staff members associated with stores';
COMMENT ON COLUMN staff.shifts IS 'JSON object containing working days, start time, end time';
COMMENT ON COLUMN staff.salary IS 'JSON object containing earnings (basic, hra, other allowances) and deductions (professional tax, epf)';
COMMENT ON COLUMN staff.commission IS 'JSON object containing commission type, cycle, and rates for different revenue categories';
COMMENT ON COLUMN staff.document_id IS 'S3 key for staff document (ID proof, contract, etc.)';
COMMENT ON COLUMN staff.photo_id IS 'S3 key for staff photo';
