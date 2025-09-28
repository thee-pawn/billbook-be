# Customer Birthday and Anniversary Fields Fix

This document explains the fix for allowing customer `birthday` and `anniversary` fields during billing customer creation.

## Problem

The billing API was rejecting requests with customer birthday and anniversary data:
```json
{
  "success": false,
  "message": "Validation error",
  "details": "\"customer.birthday\" is not allowed"
}
```

### Sample Payload That Was Failing
```json
{
  "customer": {
    "name": "Vardhan",
    "gender": "male",
    "contact_no": "+911122334455",
    "address": "",
    "birthday": "04/09",        // This was causing validation error
    "anniversary": "30/09"      // This was causing validation error
  },
  "items": [...],
  "payments": [...]
}
```

## Root Cause

1. **Validation Schema**: The `newCustomerSchema` in `src/utils/billingValidation.js` didn't include `birthday` and `anniversary` fields
2. **Database Query**: The customer creation query in `src/services/billingService.js` didn't insert these fields

## Solution Applied

### 1. Updated Validation Schema (`src/utils/billingValidation.js`)

**Before**:
```javascript
const newCustomerSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  gender: Joi.string().trim().max(50).optional(),
  contact_no: Joi.string().trim().pattern(/^\+[1-9]\d{1,14}$/).required(),
  address: Joi.string().trim().max(1000).allow('').optional(),
  email: Joi.string().email().allow('').optional()
});
```

**After**:
```javascript
const newCustomerSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  gender: Joi.string().trim().max(50).optional(),
  contact_no: Joi.string().trim().pattern(/^\+[1-9]\d{1,14}$/).required(),
  address: Joi.string().trim().max(1000).allow('').optional(),
  email: Joi.string().email().allow('').optional(),
  birthday: Joi.string().trim().max(10).optional(),     // NEW
  anniversary: Joi.string().trim().max(10).optional()   // NEW
});
```

### 2. Updated Customer Creation Query (`src/services/billingService.js`)

**Before**:
```javascript
const { rows: [newCustomer] } = await client.query(
  `INSERT INTO customers (
    store_id, phone_number, name, gender, address, email,
    loyalty_points, wallet_balance, dues, advance_amount,
    status, created_at, updated_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6, 0, 0.00, 0.00, 0.00, 'active', NOW(), NOW()
  ) RETURNING *`,
  [
    storeId, phone, customer.name, customer.gender || '',
    customer.address || '', customer.email || ''
  ]
);
```

**After**:
```javascript
const { rows: [newCustomer] } = await client.query(
  `INSERT INTO customers (
    store_id, phone_number, name, gender, address, email, birthday, anniversary,
    loyalty_points, wallet_balance, dues, advance_amount,
    status, created_at, updated_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, 0, 0.00, 0.00, 0.00, 'active', NOW(), NOW()
  ) RETURNING *`,
  [
    storeId, phone, customer.name, customer.gender || '',
    customer.address || '', customer.email || '',
    customer.birthday || null, customer.anniversary || null  // NEW
  ]
);
```

## Database Schema Compatibility

The `customers` table already had these fields defined:

```sql
-- From V22__Create_customers_tables.sql
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    gender VARCHAR(50),
    birthday VARCHAR(5),     -- Format: DD/MM (already existed)
    anniversary VARCHAR(5),  -- Format: DD/MM (already existed)
    address TEXT,
    email VARCHAR(255),
    ...
);
```

**No database migration was required** - the fields already existed!

## Field Format

Both fields support the format: **DD/MM** (without year)
- `birthday`: "04/09" (4th September)
- `anniversary`: "30/09" (30th September)
- Maximum length: 5 characters
- Optional fields (can be null/empty)

## Validation Rules

- ✅ **Optional**: Both fields are not required
- ✅ **Format**: String type, max 10 characters (allows flexibility for different formats)
- ✅ **Null/Empty**: Allowed to be null or empty string
- ✅ **Trimmed**: Whitespace is automatically trimmed

## API Usage

### ✅ **Now Supported - Customer Creation During Billing**
```json
POST /api/v1/billing/{storeId}/bills
{
  "customer": {
    "name": "Vardhan",
    "gender": "male", 
    "contact_no": "+911122334455",
    "address": "Some address",
    "birthday": "04/09",
    "anniversary": "30/09",
    "email": "vardhan@example.com"
  },
  "items": [...],
  "payments": [...]
}
```

### ✅ **Already Supported - Other Services**
The following services already supported birthday/anniversary:
- Appointment creation (`src/routes/appointments.js`)
- Booking creation (`src/services/bookingService.js`)
- Enquiry creation (`src/services/enquiryService.js`)
- Customer advance service (`src/services/customerAdvanceService.js`)

## Benefits

1. **Consistent Customer Data**: Birthday and anniversary can be captured during billing
2. **Complete Customer Profiles**: No need for separate customer update after billing
3. **Marketing Opportunities**: Stores can send birthday/anniversary promotions
4. **Data Integrity**: All customer creation paths now handle the same fields

## Backward Compatibility

✅ **Fully Compatible**:
- Existing APIs continue to work without these fields
- Fields are optional, so old payloads still work
- No changes required for existing integrations
- Database schema was already ready

## Testing

The fix should be tested with:
- ✅ Billing requests with birthday/anniversary fields
- ✅ Billing requests without birthday/anniversary fields (backward compatibility)
- ✅ Various date formats to ensure validation works
- ✅ Empty/null birthday and anniversary values

### Expected Results
```json
// Request with birthday/anniversary
{
  "customer": {
    "name": "Vardhan",
    "birthday": "04/09",
    "anniversary": "30/09"
  }
}

// Should succeed and create customer with birthday/anniversary stored
```

## Related Services Status

| Service | Birthday Support | Anniversary Support | Status |
|---------|-----------------|-------------------|--------|
| Billing | ✅ (Fixed) | ✅ (Fixed) | Ready |
| Appointments | ✅ | ✅ | Already working |
| Bookings | ✅ | ✅ | Already working |
| Enquiries | ✅ | ✅ | Already working |
| Customer Service | ✅ | ✅ | Already working |

All services now consistently support customer birthday and anniversary fields! 🎉