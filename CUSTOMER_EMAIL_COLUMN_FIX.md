# Customer Email Column Fix

This document explains the fix for the missing email column error in the customers table.

## Problem

The billing API was throwing a database error when creating customers:
```
error: column "email" of relation "customers" does not exist
```

This occurred even when the payload didn't include an email field, because the billing service was trying to insert a null email value into a non-existent column.

### Root Cause

1. **Missing Column**: The `customers` table didn't have an `email` column
2. **Service Expectation**: The billing service was trying to insert email data
3. **Schema Mismatch**: Validation allowed email but database couldn't store it

## Database Schema Analysis

### **Before (Missing Email Column)**
```sql
-- V22__Create_customers_tables.sql
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    gender VARCHAR(20),
    birthday VARCHAR(5),
    anniversary VARCHAR(5), 
    address TEXT,
    loyalty_points INTEGER DEFAULT 0,
    wallet_balance DECIMAL(10,2) DEFAULT 0.00,
    dues DECIMAL(10,2) DEFAULT 0.00,
    advance_amount DECIMAL(10,2) DEFAULT 0.00,
    last_visit TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    referral_code VARCHAR(8) NOT NULL UNIQUE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    -- ❌ NO EMAIL COLUMN
);
```

### **Other Tables Had Email**
- ✅ `users` table: Has email column  
- ✅ `staff` table: Has email column
- ✅ `enquiries` table: Has email column
- ✅ `bookings` table: Has email column
- ❌ `customers` table: Missing email column

## Solution Applied

### **Migration V45__Add_email_to_customers.sql**
```sql
-- Add email column to customers table
ALTER TABLE customers ADD COLUMN email VARCHAR(255);

-- Add index for email lookups (performance optimization)
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email) WHERE email IS NOT NULL;

-- Add comment
COMMENT ON COLUMN customers.email IS 'Customer email address for communication and billing';
```

### **After (With Email Column)**
```sql
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    gender VARCHAR(20),
    birthday VARCHAR(5),
    anniversary VARCHAR(5),
    address TEXT,
    email VARCHAR(255),                    -- ✅ NEW EMAIL COLUMN
    loyalty_points INTEGER DEFAULT 0,
    wallet_balance DECIMAL(10,2) DEFAULT 0.00,
    dues DECIMAL(10,2) DEFAULT 0.00,
    advance_amount DECIMAL(10,2) DEFAULT 0.00,
    last_visit TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    referral_code VARCHAR(8) NOT NULL UNIQUE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Migration Applied Successfully

✅ **Migration Status**:
```
✅ Migration V45 - Add email to customers completed in 19ms
📈 Migrations applied: 2
```

## Benefits of Adding Email Column

### **1. Complete Customer Profiles**
- Store customer email for communication
- Send bills, receipts, and promotions via email
- Better customer relationship management

### **2. Consistency Across Tables**
- All major entity tables now have email fields
- Consistent data model across the application
- Easier data integration and reporting

### **3. Future-Proof Design**
- Supports email-based features like:
  - Email receipts and invoices
  - Marketing campaigns
  - Password reset flows
  - Customer notifications

### **4. Validation Alignment**
- Validation schema already supported email
- Database now matches validation expectations
- No code changes required in billing service

## API Usage

### ✅ **Now Supported - Customer Creation with Email**
```json
POST /api/v1/billing/{storeId}/bills
{
  "customer": {
    "name": "Vardhan",
    "gender": "male",
    "contact_no": "+911122334455",
    "address": "",
    "birthday": "04/09",
    "anniversary": "30/09",
    "email": "vardhan@example.com"    // ✅ Now supported
  },
  "items": [...],
  "payments": [...]
}
```

### ✅ **Also Supported - Customer Creation without Email**
```json
POST /api/v1/billing/{storeId}/bills
{
  "customer": {
    "name": "Vardhan", 
    "contact_no": "+911122334455"
    // email field omitted - will store as null
  },
  "items": [...],
  "payments": [...]
}
```

## Database Column Specifications

- **Type**: `VARCHAR(255)` - Standard email length
- **Nullable**: Yes - Email is optional
- **Indexed**: Partial index on non-null emails for performance
- **Default**: NULL
- **Validation**: Application-level email format validation via Joi

## Backward Compatibility

✅ **Fully Compatible**:
- Existing customers unaffected (email will be null)
- No data loss or corruption
- All existing APIs continue to work
- New email field is optional

✅ **Service Compatibility**:
- Billing service customer creation now works
- All other services remain unaffected
- No application code changes required

## Testing Results

### **Before Migration**
```json
{
  "success": false,
  "message": "column \"email\" of relation \"customers\" does not exist"
}
```

### **After Migration**
```json
{
  "success": true,
  "message": "Bill saved successfully",
  "data": {
    "bill": {
      "customer": {
        "email": "vardhan@example.com"  // ✅ Properly stored
      }
    }
  }
}
```

## Performance Considerations

- **Index Added**: Partial index on non-null emails
- **Storage**: Minimal impact - VARCHAR(255) only for customers with emails
- **Query Performance**: Email lookups will be fast due to index
- **Migration Time**: Completed in 19ms - very fast

## Security Considerations

- **PII Data**: Email is personal information - ensure proper handling
- **Data Privacy**: Consider GDPR/privacy regulations for email storage
- **Access Control**: Ensure proper authorization for email access
- **Validation**: Application validates email format before storage

## Future Enhancements

With email column available, future features could include:
- Email receipt delivery
- Customer communication via email
- Email-based customer lookup
- Marketing campaign targeting
- Customer portal login via email

The customers table now has complete contact information (phone + email) for comprehensive customer management! 📧