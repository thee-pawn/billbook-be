# Billing API Implementation

Complete store-scoped billing system with invoice generation, tax calculations, and payment processing.

## Overview

The Billing API provides endpoints to create bills, hold drafts, and manage billing records with proper tax calculations based on store settings.

## Database Schema

### Tables Created
- **bills**: Finalized bills with invoice numbers
- **bill_items**: Line items with computed tax amounts  
- **bill_payments**: Payment records for bills
- **held_bills**: Draft bills without invoice numbers

## API Endpoints

### Base Path: `/api/v1/billing/{storeId}`

### 1. Save Bill (Finalize)
**POST** `/api/v1/billing/{storeId}/bills`

Creates a finalized bill with invoice number and processes all payments.

**Request Headers:**
- `Authorization: Bearer <token>`
- `Idempotency-Key: <optional-unique-key>` (prevents duplicates)

**Request Body:**
```json
{
  "customer_id": "uuid", // OR customer object (exactly one required)
  "customer": {
    "name": "string (required)",
    "gender": "string (optional)", 
    "contact_no": "+919876543210", // E.164 format required
    "address": "string (optional)",
    "email": "string (optional)"
  },
  "coupon_code": "string|null",
  "coupon_codes": ["string"],
  "referral_code": "string|null", 
  "items": [
    {
      "line_no": 1,
      "type": "service|product|membership",
      "id": "catalog-uuid", 
      "staff_id": "uuid|null",
      "qty": 1,
      "discount_type": "percent|flat",
      "discount_value": 0,
      "cgst": 9, // Tax rate percentage
      "sgst": 9  // Tax rate percentage
    }
  ],
  "discount": 0, // Bill-level discount
  "payment_mode": "cash|card|upi|wallet|split|none",
  "payment_amount": 0,
  "payments": [
    {
      "mode": "cash|card|upi|wallet",
      "amount": 0,
      "reference": "string|null",
      "timestamp": "2025-09-26T11:30:00.000Z"
    }
  ],
  "billing_timestamp": "2025-09-26T11:29:00.000Z",
  "payment_timestamp": "2025-09-26T11:31:00.000Z"
}
```

**Response 201:**
```json
{
  "success": true,
  "message": "Bill saved successfully",
  "data": {
    "bill_id": "uuid",
    "invoice_number": "INV202500001",
    "created_at": "ISO8601",
    "customer": {
      "id": "uuid", 
      "name": "string",
      "phoneNumber": "string",
      "address": "string"
    },
    "items": [
      {
        "line_no": 1,
        "type": "service",
        "id": "uuid",
        "name": "Service Name",
        "staff_id": "uuid|null",
        "qty": 1,
        "discount_type": "percent",
        "discount_value": 10,
        "cgst_rate": 9,
        "sgst_rate": 9,
        "cgst_amount": 81.00,
        "sgst_amount": 81.00,
        "base_amount": 1000.00,
        "discount_amount": 100.00,
        "line_total": 1062.00
      }
    ],
    "totals": {
      "sub_total": 1062.00,
      "discount": 0,
      "tax_amount": 162.00,
      "cgst_amount": 81.00,
      "sgst_amount": 81.00, 
      "grand_total": 1062.00,
      "paid": 1062.00,
      "dues": 0.00
    },
    "payments": [...]
  }
}
```

### 2. List Bills
**GET** `/api/v1/billing/{storeId}/bills`

**Query Parameters:**
- `page`: number (default 1)
- `limit`: number (default 20, max 100)  
- `from`: ISO8601 datetime filter
- `to`: ISO8601 datetime filter
- `q`: string (search customer name/phone/invoice number)
- `sort`: date_asc|date_desc|amount_asc|amount_desc
- `status`: paid|partial|unpaid

**Response 200:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "bill_id": "uuid",
        "invoice_number": "INV202500001", 
        "created_at": "ISO8601",
        "customer_name": "string",
        "customer_phone": "string",
        "grand_total": 1062.00,
        "paid": 1062.00,
        "dues": 0.00,
        "status": "paid"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

### 3. Hold Bill (Draft)
**POST** `/api/v1/billing/{storeId}/bills/hold`

Same request body as Save Bill, but:
- `payments` and payment fields are optional
- No invoice number generated
- Returns `held_id` for later retrieval

**Response 201:**
```json
{
  "success": true,
  "message": "Bill held successfully", 
  "data": {
    "held_id": "uuid",
    "created_at": "ISO8601"
  }
}
```

### 4. List Held Bills  
**GET** `/api/v1/billing/{storeId}/bills/held`

**Query Parameters:**
- `page`: number (default 1)
- `limit`: number (default 50, max 100)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "held": [
      {
        "held_id": "uuid",
        "created_at": "ISO8601", 
        "customer_summary": "Anita Singh (+919876543210)",
        "amount_estimate": 1315.0
      }
    ]
  }
}
```

### 5. Get Held Bill
**GET** `/api/v1/billing/{storeId}/bills/held/{heldId}`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "held": {
      "payload": {
        // Original request payload from hold operation
      },
      "suggested_number": "INV202500002"
    }
  }
}
```

## Business Logic

### Tax Calculations
- Uses store `tax_billing` setting (inclusive/exclusive)
- **Inclusive**: Extract base from gross, apply discount, recalculate tax
- **Exclusive**: Apply discount on base, add tax on top

### Discount Application
1. Line-level discounts applied first (per item)
2. Bill-level discount applied to total after line calculations

### Payment Status
- **paid**: `dues = 0`
- **partial**: `dues > 0 AND paid > 0` 
- **unpaid**: `paid = 0`

### Customer Resolution
- If `customer_id` provided: validate exists in store
- If `customer` object: create new or find existing by phone

### Invoice Numbering
- Format: `INV{YEAR}{6-digit-sequence}`
- Example: `INV202500001`
- Auto-incremented per store per year

## Validation Rules

### Required Fields
- Exactly one of `customer_id` OR `customer`
- `items` must be non-empty array
- `items[].qty >= 1`
- Valid catalog IDs for store and type

### Payment Validation  
- `payment_mode = "none"`: `payment_amount = 0`
- `payment_mode = "split"`: multiple payments, sum = payment_amount
- Single modes: one payment matching mode, sum = payment_amount

### Idempotency
- Optional `Idempotency-Key` header prevents duplicate creates
- Returns 409 Conflict if key already used

## Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "items[0].qty", 
      "message": "Must be >= 1"
    }
  ]
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "message": "You do not have access to this store"
}
```

**409 Conflict:**
```json
{
  "success": false,
  "message": "Bill already exists with this idempotency key"
}
```

## Usage Examples

### Create Bill with Split Payment
```bash
curl -X POST "$BASE/api/v1/billing/$STORE_ID/bills" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: bill-001" \
  -d '{
    "customer_id": "CUST789",
    "items": [
      {
        "line_no": 1,
        "type": "service", 
        "id": "SER101",
        "staff_id": "STF9",
        "qty": 1,
        "discount_type": "percent",
        "discount_value": 10,
        "cgst": 9,
        "sgst": 9
      }
    ],
    "discount": 0,
    "payment_mode": "split",
    "payment_amount": 1000,
    "payments": [
      {
        "mode": "upi",
        "amount": 600, 
        "reference": "UPI-123",
        "timestamp": "2025-09-26T11:30:00.000Z"
      },
      {
        "mode": "cash",
        "amount": 400,
        "reference": null,
        "timestamp": "2025-09-26T11:31:00.000Z" 
      }
    ],
    "billing_timestamp": "2025-09-26T11:29:00.000Z",
    "payment_timestamp": "2025-09-26T11:31:00.000Z"
  }'
```

### Hold Bill for New Customer
```bash  
curl -X POST "$BASE/api/v1/billing/$STORE_ID/bills/hold" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "name": "Anita Singh",
      "gender": "Female",
      "contact_no": "+919876543210",
      "address": "Delhi"
    },
    "items": [
      {
        "line_no": 1,
        "type": "service",
        "id": "SER101", 
        "qty": 1,
        "discount_type": "percent",
        "discount_value": 0,
        "cgst": 9,
        "sgst": 9
      }
    ],
    "discount": 0,
    "payment_mode": "none",
    "payment_amount": 0,
    "billing_timestamp": "2025-09-26T12:00:00.000Z"
  }'
```

## Implementation Notes

- All monetary calculations use 2 decimal precision
- Transactions ensure atomicity for bill + items + payments + customer creation
- Store access validated via `store_users` table
- Catalog item validation ensures items belong to the store
- Customer phone numbers stored in E.164 format
- Tax rates stored as percentages (9 = 9%)
- Bill status automatically calculated from payment amounts