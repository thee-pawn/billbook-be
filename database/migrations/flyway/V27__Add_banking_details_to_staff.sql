-- Add banking details to staff table
ALTER TABLE staff 
ADD COLUMN account_number VARCHAR(20),
ADD COLUMN ifsc_code VARCHAR(11),
ADD COLUMN banking_name VARCHAR(255), -- Name as per bank records
ADD COLUMN bank_name VARCHAR(255); -- Bank name

-- Add indexes for banking fields
CREATE INDEX idx_staff_account_number ON staff(account_number);
CREATE INDEX idx_staff_ifsc_code ON staff(ifsc_code);

-- Add comments for documentation
COMMENT ON COLUMN staff.account_number IS 'Bank account number for salary transfers';
COMMENT ON COLUMN staff.ifsc_code IS 'IFSC code for bank transfers';
COMMENT ON COLUMN staff.banking_name IS 'Name as registered in bank account';
COMMENT ON COLUMN staff.bank_name IS 'Name of the bank';
