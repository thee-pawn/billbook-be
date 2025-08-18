-- Create expenses table to store employee expense records
-- Expenses are linked to stores and employees with receipt file management

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    expense_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    category VARCHAR(100) NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    payment_method VARCHAR(50) NOT NULL,
    description TEXT,
    receipt_id VARCHAR(255), -- File key from S3 upload
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID, -- User ID who approved/rejected
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX idx_expenses_store_id ON expenses(store_id);
CREATE INDEX idx_expenses_employee_id ON expenses(employee_id);
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_amount ON expenses(amount);

-- Add comments to the table
COMMENT ON TABLE expenses IS 'Employee expense records with receipt management';
COMMENT ON COLUMN expenses.expense_name IS 'Name/title of the expense';
COMMENT ON COLUMN expenses.date IS 'Date when the expense was incurred';
COMMENT ON COLUMN expenses.category IS 'Category of expense (e.g., travel, meals, supplies, etc.)';
COMMENT ON COLUMN expenses.amount IS 'Amount of the expense in store currency';
COMMENT ON COLUMN expenses.payment_method IS 'Method of payment (cash, card, bank transfer, etc.)';
COMMENT ON COLUMN expenses.receipt_id IS 'S3 file key for the uploaded receipt image/document';
COMMENT ON COLUMN expenses.status IS 'Approval status: pending, approved, rejected';
COMMENT ON COLUMN expenses.approved_by IS 'User ID who approved or rejected the expense';
COMMENT ON COLUMN expenses.approved_at IS 'Timestamp when the expense was approved/rejected';
