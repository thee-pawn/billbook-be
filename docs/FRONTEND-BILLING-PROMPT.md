# Frontend API Prompt: Billing System

Complete guide for integrating the Billing API endpoints into your frontend application.

## Base Configuration

**Base URL:** `/api/v1`  
**Authentication:** All endpoints require `Authorization: Bearer <JWT>` header  
**Content-Type:** `application/json` for all POST requests  
**Store Scope:** All endpoints are under `/billing/{storeId}` path  

**Common Response Format:**
```json
{
  "success": boolean,
  "message": string,
  "data": object
}
```

## 1. SAVE BILL (Finalize Bill with Invoice)

**Endpoint:** `POST /api/v1/billing/{storeId}/bills`

**Headers:**
```
Authorization: Bearer <JWT>
Content-Type: application/json
Idempotency-Key: <optional-unique-key>  // Prevents duplicate bills
```

**Request Body Schema:**
```javascript
{
  // CUSTOMER (exactly one required)
  customer_id: "uuid",           // OR
  customer: {                    // OR (for new customers)
    name: "string",              // Required, min 1 char
    gender: "Male|Female|Other", // Optional
    contact_no: "+919876543210", // Required, E.164 format
    address: "string",           // Optional
    email: "email@domain.com"    // Optional
  },
  
  // COUPONS & REFERRALS
  coupon_code: "SAVE20",         // Primary coupon (optional)
  coupon_codes: ["SAVE20", "WELCOME10"], // All applied coupons (optional)
  referral_code: "REF123",       // Optional
  
  // ITEMS (required, non-empty array)
  items: [
    {
      line_no: 1,                // Required, unique per bill
      type: "service|product|membership", // Required
      id: "catalog-uuid",        // Required, must exist in store
      staff_id: "staff-uuid",    // Optional
      qty: 1,                    // Required, min 1
      discount_type: "percent|flat", // Required
      discount_value: 10.5,      // Required, >= 0
      cgst: 9,                   // Required, tax rate %
      sgst: 9                    // Required, tax rate %
    }
  ],
  
  // DISCOUNTS & PAYMENTS
  discount: 50.00,               // Bill-level discount, >= 0
  payment_mode: "cash|card|upi|wallet|split|none", // Required
  payment_amount: 1500.00,       // Required, >= 0
  payments: [                    // Required for non-"none" modes
    {
      mode: "upi",               // cash|card|upi|wallet
      amount: 1000.00,           // > 0
      reference: "UPI-TXN-123",  // Optional transaction ref
      timestamp: "2025-09-26T11:30:00.000Z" // Required ISO8601
    },
    {
      mode: "cash",
      amount: 500.00,
      reference: null,
      timestamp: "2025-09-26T11:31:00.000Z"
    }
  ],
  
  // TIMESTAMPS
  billing_timestamp: "2025-09-26T11:29:00.000Z",  // Required
  payment_timestamp: "2025-09-26T11:31:00.000Z"   // Optional
}
```

**Payment Mode Rules:**
- `"none"`: `payment_amount = 0`, `payments = []`
- `"split"`: Multiple payments, `sum(payments.amount) = payment_amount`
- Single modes: One payment, `payment.mode = payment_mode`, `payment.amount = payment_amount`

**Success Response (201):**
```javascript
{
  success: true,
  message: "Bill saved successfully",
  data: {
    bill_id: "uuid",
    invoice_number: "INV202500001",
    created_at: "2025-09-26T11:29:15.123Z",
    customer: {
      id: "customer-uuid",
      name: "John Doe",
      phoneNumber: "+919876543210",
      address: "123 Main St"
    },
    items: [
      {
        line_no: 1,
        type: "service",
        id: "service-uuid",
        name: "Haircut Premium",
        staff_id: "staff-uuid",
        qty: 1,
        discount_type: "percent",
        discount_value: 10,
        cgst_rate: 9,
        sgst_rate: 9,
        cgst_amount: 81.00,      // Computed
        sgst_amount: 81.00,      // Computed
        base_amount: 1000.00,    // Computed
        discount_amount: 100.00, // Computed
        line_total: 1062.00      // Computed
      }
    ],
    totals: {
      sub_total: 1062.00,        // Sum of line totals
      discount: 50.00,           // Bill-level discount applied
      tax_amount: 162.00,        // Total CGST + SGST
      cgst_amount: 81.00,        // Total CGST
      sgst_amount: 81.00,        // Total SGST
      grand_total: 1012.00,      // Final amount after all discounts
      paid: 1012.00,             // Amount paid
      dues: 0.00                 // Outstanding amount
    },
    payments: [
      {
        mode: "upi",
        amount: 612.00,
        reference: "UPI-TXN-123",
        timestamp: "2025-09-26T11:30:00.000Z"
      },
      {
        mode: "cash", 
        amount: 400.00,
        reference: null,
        timestamp: "2025-09-26T11:31:00.000Z"
      }
    ]
  }
}
```

## 2. LIST BILLS

**Endpoint:** `GET /api/v1/billing/{storeId}/bills`

**Query Parameters (all optional):**
```javascript
{
  page: 1,                    // Default 1, min 1
  limit: 20,                  // Default 20, max 100
  from: "2025-09-01T00:00:00.000Z",  // Start date filter
  to: "2025-09-30T23:59:59.999Z",    // End date filter  
  q: "john doe",              // Search: customer name/phone/invoice
  sort: "date_desc",          // date_asc|date_desc|amount_asc|amount_desc
  status: "paid"              // paid|partial|unpaid
}
```

**Success Response (200):**
```javascript
{
  success: true,
  data: {
    items: [
      {
        bill_id: "uuid",
        invoice_number: "INV202500001", 
        created_at: "2025-09-26T11:29:15.123Z",
        customer_name: "John Doe",
        customer_phone: "+919876543210",
        grand_total: 1012.00,
        paid: 1012.00,
        dues: 0.00,
        status: "paid"          // paid|partial|unpaid
      }
    ],
    page: 1,
    limit: 20,
    total: 145                  // Total matching records
  }
}
```

## 3. HOLD BILL (Save as Draft)

**Endpoint:** `POST /api/v1/billing/{storeId}/bills/hold`

**Headers:** Same as Save Bill

**Request Body:** Same as Save Bill, but:
- `payments` array is optional (can be empty)
- `payment_mode` defaults to "none"
- `payment_amount` defaults to 0
- `payment_timestamp` is optional

**Success Response (201):**
```javascript
{
  success: true,
  message: "Bill held successfully",
  data: {
    held_id: "uuid",
    created_at: "2025-09-26T12:00:00.000Z"
  }
}
```

## 4. LIST HELD BILLS

**Endpoint:** `GET /api/v1/billing/{storeId}/bills/held`

**Query Parameters (optional):**
```javascript
{
  page: 1,                    // Default 1
  limit: 50                   // Default 50, max 100
}
```

**Success Response (200):**
```javascript
{
  success: true,
  data: {
    held: [
      {
        held_id: "uuid",
        created_at: "2025-09-26T12:00:00.000Z",
        customer_summary: "Anita Singh (+919876543210)",
        amount_estimate: 1315.50
      }
    ]
  }
}
```

## 5. GET HELD BILL DETAILS

**Endpoint:** `GET /api/v1/billing/{storeId}/bills/held/{heldId}`

**Success Response (200):**
```javascript
{
  success: true,
  data: {
    held: {
      payload: {
        // Original request payload from when bill was held
        customer: { name: "Anita Singh", ... },
        items: [...],
        // ... complete original request
      },
      suggested_number: "INV202500002"  // Next available invoice number
    }
  }
}
```

## Frontend Integration Guide

### 1. Customer Selection Flow
```javascript
// Option 1: Existing customer
const billData = {
  customer_id: selectedCustomer.id,
  // ... rest of bill data
};

// Option 2: New customer  
const billData = {
  customer: {
    name: customerForm.name,
    contact_no: customerForm.phone, // Must be E.164 format
    gender: customerForm.gender,
    address: customerForm.address,
    email: customerForm.email
  },
  // ... rest of bill data
};
```

### 2. Items Management
```javascript
const items = cartItems.map((item, index) => ({
  line_no: index + 1,
  type: item.catalogType,     // 'service'|'product'|'membership'
  id: item.catalogId,
  staff_id: item.assignedStaff?.id || null,
  qty: item.quantity,
  discount_type: item.discountType,
  discount_value: item.discountAmount,
  cgst: item.cgstRate,        // Store your tax rates
  sgst: item.sgstRate
}));
```

### 3. Payment Processing
```javascript
// Single payment
const singlePayment = {
  payment_mode: selectedMode,    // 'cash'|'card'|'upi'|'wallet'
  payment_amount: totalAmount,
  payments: [{
    mode: selectedMode,
    amount: totalAmount,
    reference: transactionRef,   // For card/upi transactions
    timestamp: new Date().toISOString()
  }]
};

// Split payment
const splitPayment = {
  payment_mode: 'split',
  payment_amount: paymentMethods.reduce((sum, p) => sum + p.amount, 0),
  payments: paymentMethods.map(p => ({
    mode: p.method,
    amount: p.amount,
    reference: p.reference,
    timestamp: new Date().toISOString()
  }))
};

// No payment (hold)
const holdPayment = {
  payment_mode: 'none',
  payment_amount: 0,
  payments: []
};
```

### 4. Error Handling
```javascript
try {
  const response = await fetch(`/api/v1/billing/${storeId}/bills`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': generateUniqueKey() // Prevent duplicates
    },
    body: JSON.stringify(billData)
  });
  
  const result = await response.json();
  
  if (!response.ok) {
    if (response.status === 400) {
      // Validation errors
      console.error('Validation failed:', result.errors);
      showValidationErrors(result.errors);
    } else if (response.status === 409) {
      // Duplicate bill (idempotency conflict)
      console.error('Bill already exists');
      showDuplicateError();
    } else if (response.status === 403) {
      // No store access
      console.error('Store access denied');
      redirectToLogin();
    }
    return;
  }
  
  // Success - show invoice
  const bill = result.data;
  showInvoice(bill);
  
} catch (error) {
  console.error('Network error:', error);
  showNetworkError();
}
```

### 5. Invoice Display
```javascript
function displayInvoice(billData) {
  return {
    invoiceNumber: billData.invoice_number,
    date: new Date(billData.created_at).toLocaleDateString(),
    customer: billData.customer,
    items: billData.items.map(item => ({
      name: item.name,
      quantity: item.qty,
      baseAmount: item.base_amount,
      discount: item.discount_amount,
      tax: item.cgst_amount + item.sgst_amount,
      total: item.line_total
    })),
    totals: {
      subtotal: billData.totals.sub_total,
      discount: billData.totals.discount,
      tax: billData.totals.tax_amount,
      grandTotal: billData.totals.grand_total,
      paid: billData.totals.paid,
      balance: billData.totals.dues
    },
    payments: billData.payments,
    status: billData.totals.dues === 0 ? 'PAID' : 
            billData.totals.paid > 0 ? 'PARTIAL' : 'UNPAID'
  };
}
```

### 6. Draft Management
```javascript
// Save as draft
async function saveDraft(billData) {
  const response = await fetch(`/api/v1/billing/${storeId}/bills/hold`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...billData,
      payment_mode: 'none',
      payment_amount: 0,
      payments: []
    })
  });
  
  const result = await response.json();
  return result.data.held_id;
}

// Load draft for editing
async function loadDraft(heldId) {
  const response = await fetch(`/api/v1/billing/${storeId}/bills/held/${heldId}`, {
    headers: { 'Authorization': `Bearer ${jwt}` }
  });
  
  const result = await response.json();
  const originalPayload = result.data.held.payload;
  const suggestedInvoice = result.data.held.suggested_number;
  
  // Populate form with draft data
  populateForm(originalPayload);
  setNextInvoiceNumber(suggestedInvoice);
}
```

## Validation Checklist

**Before Submit:**
- [ ] Either `customer_id` OR `customer` provided (not both)
- [ ] Customer phone in E.164 format (+country_code)
- [ ] All items have valid `qty >= 1`
- [ ] Payment amounts sum correctly for split payments
- [ ] Payment mode matches payment array contents
- [ ] All required timestamps are ISO8601 format
- [ ] Tax rates are percentages (9 = 9%)
- [ ] Catalog IDs exist and belong to the store

**Success Indicators:**
- Status 201 for bill creation
- Invoice number generated (INV format)
- All computed amounts returned (taxes, totals)
- Payment status calculated correctly

**Error Recovery:**
- 400: Fix validation errors and retry
- 403: Check store access permissions  
- 409: Use different Idempotency-Key
- 500: Retry with exponential backoff

## Complete Example

```javascript
// Complete bill creation flow
const createBill = async () => {
  const billRequest = {
    customer_id: "customer-uuid-123",
    coupon_code: "SAVE20",
    items: [
      {
        line_no: 1,
        type: "service",
        id: "service-uuid-456", 
        staff_id: "staff-uuid-789",
        qty: 1,
        discount_type: "percent",
        discount_value: 10,
        cgst: 9,
        sgst: 9
      }
    ],
    discount: 50,
    payment_mode: "upi", 
    payment_amount: 962.00,
    payments: [{
      mode: "upi",
      amount: 962.00,
      reference: "UPI-2025092612345",
      timestamp: "2025-09-26T12:30:00.000Z"
    }],
    billing_timestamp: "2025-09-26T12:29:00.000Z",
    payment_timestamp: "2025-09-26T12:30:00.000Z"
  };
  
  try {
    const response = await fetch(`/api/v1/billing/${storeId}/bills`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `bill-${Date.now()}-${Math.random()}`
      },
      body: JSON.stringify(billRequest)
    });
    
    if (response.ok) {
      const bill = await response.json();
      console.log('Bill created:', bill.data.invoice_number);
      printInvoice(bill.data);
    } else {
      const error = await response.json();
      console.error('Failed to create bill:', error.message);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
};
```

This comprehensive guide covers all aspects of integrating the Billing API, including request formats, validation rules, error handling, and practical implementation examples.