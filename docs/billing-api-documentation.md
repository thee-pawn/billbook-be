# Billing API Documentation

This document provides comprehensive information about the Billing APIs for frontend integration.

## Base URL
```
{BASE_URL}/api/v1
```

## Authentication
All APIs except the public bill retrieval endpoint require JWT authentication via the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

## Common Response Format
```json
{
  "success": boolean,
  "message": string,
  "data": object,
  "error": string (optional)
}
```

---

## 1. Create Bill

**Endpoint:** `POST /billing/{storeId}/bills`  
**Authentication:** Required  
**Description:** Creates and finalizes a new bill

### Path Parameters
- `storeId` (UUID, required): Store identifier

### Headers
- `Authorization: Bearer <token>` (required)
- `Idempotency-Key: <unique_key>` (optional): Prevents duplicate bill creation

### Request Body
```json
{
  "customer_id": "uuid", // Optional: existing customer ID
  "customer": { // Optional: new customer details (if customer_id not provided)
    "name": "John Doe",
    "gender": "Male",
    "contact_no": "+1234567890", // E.164 format
    "address": "123 Main St",
    "email": "john@example.com",
    "birthday": "15/05", // DD/MM format
    "anniversary": "20/12" // DD/MM format
  },
  "items": [
    {
      "line_no": 1,
      "type": "service", // "service" | "product" | "membership"
      "id": "catalog_item_uuid",
      "staff_id": "staff_uuid", // Optional
      "qty": 1,
      "price": 100.00,
      "discount_type": "percent", // "percent" | "flat"
      "discount_value": 10.0,
      "cgst": 9.0, // CGST rate or amount
      "sgst": 9.0  // SGST rate or amount
    }
  ],
  "discount": 5.0, // Additional bill-level discount
  "payment_mode": "cash", // "cash" | "card" | "upi" | "wallet" | "advance" | "split" | "none"
  "payment_amount": 95.0,
  "payments": [ // Required for split payments
    {
      "mode": "cash",
      "amount": 50.0,
      "reference": "REF123", // Optional
      "payment_timestamp": "2025-09-27T10:30:00Z"
    }
  ],
  "billing_timestamp": "2025-09-27T10:30:00Z",
  "payment_timestamp": "2025-09-27T10:30:00Z", // Optional
  "coupon_codes": ["SAVE10", "WELCOME"], // Optional
  "referral_code": "REF123", // Optional
  "notes": "Customer notes" // Optional
}
```

### Response (201 Created)
```json
{
  "success": true,
  "message": "Bill saved successfully",
  "data": {
    "bill": {
      "id": "bill_uuid",
      "invoice_number": "INV-2025-001234",
      "created_at": "2025-09-27T10:30:00Z",
      "billing_timestamp": "2025-09-27T10:30:00Z",
      "payment_timestamp": "2025-09-27T10:30:00Z",
      "customer": {
        "id": "customer_uuid",
        "name": "John Doe",
        "phone_number": "+1234567890",
        "gender": "Male",
        "address": "123 Main St",
        "birthday": "15/05",
        "anniversary": "20/12"
      },
      "store": {
        "id": "store_uuid",
        "name": "My Store",
        "address": {
          "address_line_1": "Store Address",
          "locality": "Locality",
          "city": "City",
          "state": "State",
          "country": "Country",
          "pincode": "123456",
          "full_address": "Complete formatted address"
        },
        "phone_number": "+1234567890",
        "email": "store@example.com",
        "gstin": "GST123456789",
        "logo_url": "https://example.com/logo.png"
      },
      "items": [
        {
          "line_no": 1,
          "type": "service",
          "catalog_id": "service_uuid",
          "name": "Service Name",
          "description": "Service Description",
          "staff_id": "staff_uuid",
          "staff_name": "Staff Name",
          "quantity": 1,
          "unit_price": 100.00,
          "discount_type": "percent",
          "discount_value": 10.0,
          "cgst_rate": 9.0,
          "sgst_rate": 9.0,
          "base_amount": 100.00,
          "discount_amount": 10.00,
          "taxable_amount": 90.00,
          "cgst_amount": 8.10,
          "sgst_amount": 8.10,
          "tax_amount": 16.20,
          "line_total": 106.20
        }
      ],
      "payments": [
        {
          "id": "payment_uuid",
          "mode": "cash",
          "amount": 95.00,
          "reference": null,
          "timestamp": "2025-09-27T10:30:00Z",
          "created_at": "2025-09-27T10:30:00Z"
        }
      ],
      "totals": {
        "sub_total": 100.00,
        "discount": 15.00,
        "tax_amount": 16.20,
        "cgst_amount": 8.10,
        "sgst_amount": 8.10,
        "grand_total": 106.20,
        "paid": 95.00,
        "dues": 11.20,
        "status": "partial" // "paid" | "partial" | "unpaid"
      },
      "coupon_codes": ["SAVE10", "WELCOME"],
      "referral_code": "REF123",
      "notes": "Customer notes"
    }
  }
}
```

---

## 2. Get Bill by ID (Public)

**Endpoint:** `GET /billing/{storeId}/bills/{billId}`  
**Authentication:** Not Required (Public API)  
**Description:** Retrieves complete bill details by ID

### Path Parameters
- `storeId` (UUID, required): Store identifier
- `billId` (UUID, required): Bill identifier

### Response (200 OK)
Same structure as Create Bill response data.

---

## 3. List Bills

**Endpoint:** `GET /billing/{storeId}/bills`  
**Authentication:** Required  
**Description:** Lists all bills for a store with pagination and filters

### Path Parameters
- `storeId` (UUID, required): Store identifier

### Query Parameters
- `page` (integer, default: 1): Page number
- `limit` (integer, default: 20, max: 100): Items per page
- `from` (ISO date, optional): Start date filter
- `to` (ISO date, optional): End date filter
- `q` (string, optional): Search term (customer name, phone, invoice number)
- `sort` (string, optional): Sort order
  - `date_asc`: Oldest first
  - `date_desc`: Newest first (default)
  - `amount_asc`: Lowest amount first
  - `amount_desc`: Highest amount first
- `status` (string, optional): Filter by payment status (`paid`, `partial`, `unpaid`)

### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "bill_id": "bill_uuid",
        "invoice_number": "INV-2025-001234",
        "created_at": "2025-09-27T10:30:00Z",
        "customer_name": "John Doe",
        "customer_phone": "+1234567890",
        "grand_total": 106.20,
        "paid": 95.00,
        "dues": 11.20,
        "status": "partial"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

---

## 4. List Customer Bills (NEW) ⭐ MAIN FOCUS

**Endpoint:** `GET /billing/{storeId}/customers/{customerId}/bills`  
**Authentication:** Required  
**Description:** Lists all bills for a specific customer with pagination, filters, and summary statistics. **Primary use case: Due Bills Management** - Filter outstanding payments for follow-up.

### Path Parameters
- `storeId` (UUID, required): Store identifier
- `customerId` (UUID, required): Customer identifier

### Query Parameters
- `page` (integer, default: 1): Page number
- `limit` (integer, default: 20, max: 100): Items per page
- `from` (ISO date, optional): Start date filter
- `to` (ISO date, optional): End date filter
- `sort` (string, default: `date_desc`): Sort order
  - `date_asc`: Oldest first
  - `date_desc`: Newest first
  - `amount_asc`: Lowest amount first
  - `amount_desc`: Highest amount first
- `due_only` (boolean, default: false): **🔥 KEY FEATURE** - Show only bills with pending dues for payment follow-up

### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "customer_uuid",
      "name": "John Doe",
      "phone_number": "+1234567890"
    },
    "summary": {
      "total_bills": 25,
      "total_billed": 5000.00,
      "total_paid": 4500.00,
      "total_dues": 500.00,
      "bills_with_dues": 3
    },
    "bills": [
      {
        "bill_id": "bill_uuid",
        "invoice_number": "INV-2025-001234",
        "billing_timestamp": "2025-09-27T10:30:00Z",
        "payment_timestamp": "2025-09-27T10:30:00Z",
        "created_at": "2025-09-27T10:30:00Z",
        "customer": {
          "id": "customer-uuid",
          "name": "John Doe",
          "phone_number": "+1234567890"
        },
        "customer_name": "John Doe",
        "customer_phone": "+1234567890",
        "sub_total": 100.00,
        "discount": 15.00,
        "tax_amount": 16.20,
        "cgst_amount": 8.10,
        "sgst_amount": 8.10,
        "grand_total": 106.20,
        "paid": 95.00,
        "dues": 11.20,
        "status": "partial",
        "payment_mode": "cash",
        "coupon_codes": ["SAVE10"],
        "referral_code": "REF123",
        "payment_status": "partial", // Enhanced status
        "is_overdue": true // True if dues > 0 and no payment_timestamp
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 25,
      "has_more": true
    }
  }
}
```

### 🎯 Due Bills Management Examples

#### Get All Customer Bills
```
GET /api/v1/billing/store-uuid/customers/customer-uuid/bills?page=1&limit=10
```

#### Get Only Due Bills (Main Use Case)
```
GET /api/v1/billing/store-uuid/customers/customer-uuid/bills?due_only=true&sort=date_asc
```

#### Get Overdue Bills from Last 30 Days
```javascript
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const url = `/api/v1/billing/${storeId}/customers/${customerId}/bills?` +
  `due_only=true&` +
  `from=${thirtyDaysAgo.toISOString()}&` +
  `sort=amount_desc`;
```

#### Due Bills Response Structure
```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "customer-uuid",
      "name": "John Doe",
      "phone_number": "+1234567890"
    },
    "summary": {
      "total_bills": 25,
      "total_billed": 5000.00,
      "total_paid": 4500.00,
      "total_dues": 500.00,      // 👈 Outstanding amount
      "bills_with_dues": 3       // 👈 Number of unpaid bills
    },
    "bills": [
      {
        "bill_id": "bill-uuid-1",
        "invoice_number": "INV-2025-001234",
        "grand_total": 200.00,
        "paid": 100.00,
        "dues": 100.00,           // 👈 Amount still owed
        "payment_status": "partial",
        "is_overdue": true,       // 👈 No payment_timestamp but has dues
        "billing_timestamp": "2025-09-20T10:30:00Z",
        "payment_timestamp": null
      },
      {
        "bill_id": "bill-uuid-2", 
        "invoice_number": "INV-2025-001235",
        "grand_total": 300.00,
        "paid": 0.00,
        "dues": 300.00,          // 👈 Completely unpaid
        "payment_status": "unpaid",
        "is_overdue": true,
        "billing_timestamp": "2025-09-25T14:15:00Z",
        "payment_timestamp": null
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 3,
      "has_more": false
    }
  }
}
```

---

## 5. Hold Bill

**Endpoint:** `POST /billing/{storeId}/bills/hold`  
**Authentication:** Required  
**Description:** Puts a bill on hold (temporary save)

### Request Body
Similar to Create Bill but with optional payments:
```json
{
  "customer_id": "uuid",
  "items": [...],
  "payment_mode": "none", // Default for held bills
  "payment_amount": 0,
  "billing_timestamp": "2025-09-27T10:30:00Z"
}
```

### Response (201 Created)
```json
{
  "success": true,
  "message": "Bill held successfully",
  "data": {
    "held_id": "held_bill_uuid",
    "created_at": "2025-09-27T10:30:00Z"
  }
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation error",
  "error": "Detailed validation error message"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "You do not have access to this store"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Customer not found in this store"
}
```

### 409 Conflict (Duplicate)
```json
{
  "success": false,
  "message": "Bill already exists with this idempotency key"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error",
  "error": "Error details (in development mode)"
}
```

---

## Frontend Integration Guidelines

### 1. Customer Bill Management - Due Bills Focus 🎯

#### Primary Use Cases:
- **🔥 Due Bills Dashboard**: Use `due_only=true` to show outstanding payments
- **📞 Payment Follow-up**: Track overdue bills with `is_overdue` flag
- **💰 Outstanding Balance**: Monitor `total_dues` from summary
- **📊 Customer Analytics**: Complete billing history and payment patterns
- **👤 Customer Profile**: Full billing relationship overview

#### Key Implementation Points:
```javascript
// 1. Due Bills Dashboard
const getDueBills = async (customerId) => {
  const response = await fetch(
    `/api/v1/billing/${storeId}/customers/${customerId}/bills?due_only=true&sort=date_asc`
  );
  return response.json();
};

// 2. Overdue Bills Alert
const getOverdueBills = (bills) => {
  return bills.filter(bill => bill.is_overdue && bill.dues > 0);
};

// 3. Payment Priority (highest dues first)
const getPriorityPayments = async (customerId) => {
  const response = await fetch(
    `/api/v1/billing/${storeId}/customers/${customerId}/bills?due_only=true&sort=amount_desc`
  );
  return response.json();
};
```

### 2. Error Handling
```javascript
try {
  const response = await fetch('/api/v1/billing/store-id/bills', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': generateUniqueKey()
    },
    body: JSON.stringify(billData)
  });
  
  const result = await response.json();
  
  if (!result.success) {
    // Handle business logic errors
    console.error('Business Error:', result.message);
    showUserError(result.message);
  } else {
    // Handle success
    console.log('Bill Created:', result.data.bill);
  }
} catch (error) {
  // Handle network/parsing errors
  console.error('Network Error:', error);
  showUserError('Network error occurred');
}
```

### 3. Pagination Implementation
```javascript
const [currentPage, setCurrentPage] = useState(1);
const [bills, setBills] = useState([]);
const [hasMore, setHasMore] = useState(false);

const loadCustomerBills = async (customerId, page = 1) => {
  const response = await fetch(
    `/api/v1/billing/${storeId}/customers/${customerId}/bills?page=${page}&limit=20&due_only=${showOnlyDue}`
  );
  const result = await response.json();
  
  if (page === 1) {
    setBills(result.data.bills);
  } else {
    setBills(prev => [...prev, ...result.data.bills]);
  }
  
  setHasMore(result.data.pagination.has_more);
};
```

### 4. Date Filtering
```javascript
const filterBillsByDate = (fromDate, toDate) => {
  const params = new URLSearchParams({
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    page: 1,
    limit: 20
  });
  
  return fetch(`/api/v1/billing/${storeId}/bills?${params}`);
};
```

### 5. Real-time Status Updates
The `payment_status` and `is_overdue` fields provide enhanced status information:
- Use `payment_status` for UI indicators (paid/partial/unpaid badges)
- Use `is_overdue` to highlight urgent follow-ups
- Use `dues` amount to show outstanding balances

---

## Troubleshooting Common Issues

### 1. "Cannot read properties of undefined (reading 'name')"
**Problem**: Frontend trying to access customer name from undefined object.

**Solution**: All API responses now include null-safe customer information:
```javascript
// ✅ Safe access patterns
const customerName = bill.customer?.name || bill.customer_name || 'Unknown';
const customerPhone = bill.customer?.phone_number || bill.customer_phone || '';

// ✅ Always check for data existence
if (data.bills && Array.isArray(data.bills)) {
  data.bills.map(bill => {
    // bill.customer is always defined (may be empty string)
    return bill.customer.name || 'No Name';
  });
}
```

### 2. Pagination Parameters
**Problem**: "Invalid pagination parameters" or NaN errors.

**Solution**: Always provide valid integers:
```javascript
const params = new URLSearchParams({
  page: Math.max(1, parseInt(page) || 1),
  limit: Math.min(100, Math.max(1, parseInt(limit) || 20))
});
```

### 3. Date Filtering
**Problem**: Date parameters not working.

**Solution**: Use ISO format dates:
```javascript
const fromDate = new Date('2025-01-01').toISOString();
const toDate = new Date().toISOString();
```

## Rate Limiting
All APIs are rate-limited. Implement retry logic with exponential backoff for production use.

## Support
For API issues or questions, contact the backend development team with:
1. Request/Response examples
2. Error messages
3. Expected vs actual behavior