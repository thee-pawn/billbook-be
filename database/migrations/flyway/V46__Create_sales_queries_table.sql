-- Create sales_queries table for storing sales-related customer queries
CREATE TABLE IF NOT EXISTS sales_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    query TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed')) NOT NULL
);

-- Create index on created_at for efficient sorting
CREATE INDEX IF NOT EXISTS idx_sales_queries_created_at ON sales_queries (created_at);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_sales_queries_status ON sales_queries (status);
