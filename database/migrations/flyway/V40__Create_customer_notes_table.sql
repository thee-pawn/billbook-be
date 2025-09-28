-- V40: Create customer_notes table

CREATE TABLE customer_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    notes TEXT NOT NULL,
    starred BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_customer_notes_customer_id ON customer_notes(customer_id);
CREATE INDEX idx_customer_notes_created_at ON customer_notes(created_at);

COMMENT ON TABLE customer_notes IS 'Notes attached to a customer profile, optionally starred for quick reference';
COMMENT ON COLUMN customer_notes.notes IS 'The note text';
COMMENT ON COLUMN customer_notes.starred IS 'Whether the note is marked as important/starred';
