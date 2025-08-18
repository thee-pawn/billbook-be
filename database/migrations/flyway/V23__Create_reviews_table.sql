-- Create reviews table to store customer reviews and ratings for stores
-- Reviews will be public and not tied to authenticated users

CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,
    referring_id VARCHAR(255) NOT NULL,
    staff_rating INTEGER NOT NULL CHECK (staff_rating >= 1 AND staff_rating <= 5),
    hospitality_rating INTEGER NOT NULL CHECK (hospitality_rating >= 1 AND hospitality_rating <= 5),
    service_rating INTEGER NOT NULL CHECK (service_rating >= 1 AND service_rating <= 5),
    review TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'rejected')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Create unique index on store_id and referring_id to prevent duplicate reviews from same referring source
CREATE UNIQUE INDEX idx_reviews_store_referring 
ON reviews(store_id, referring_id);

-- Create indexes for performance
CREATE INDEX idx_reviews_store_id ON reviews(store_id);
CREATE INDEX idx_reviews_status ON reviews(status);
CREATE INDEX idx_reviews_created_at ON reviews(created_at);

-- Add comment to the table
COMMENT ON TABLE reviews IS 'Store reviews and ratings from customers';
COMMENT ON COLUMN reviews.referring_id IS 'Unique identifier for the review source (customer phone, email, or unique code)';
COMMENT ON COLUMN reviews.staff_rating IS 'Rating for staff service (1-5 scale)';
COMMENT ON COLUMN reviews.hospitality_rating IS 'Rating for hospitality (1-5 scale)';
COMMENT ON COLUMN reviews.service_rating IS 'Rating for overall service quality (1-5 scale)';
COMMENT ON COLUMN reviews.status IS 'Review status: active (published), inactive (hidden), pending (awaiting approval), rejected (spam/inappropriate)';
