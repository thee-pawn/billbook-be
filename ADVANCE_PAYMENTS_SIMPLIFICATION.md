# Advance Payments Simplification

This document explains the changes made to remove dependency on the `advance_payments` table and use only the `customers.advance_amount` field for all advance payment operations.

## Overview

The system has been updated to handle all advance payment operations directly through the `customers` table's `advance_amount` field, eliminating the need for complex tracking in the `advance_payments` table.

## Changes Made

### 1. Billing Service Updates (`src/services/billingService.js`)

#### **Removed Dependencies**
- ✅ Removed import of `customerAdvanceService` functions
- ✅ No longer uses `deductAdvancePayment()` from external service
- ✅ No longer uses `addAdvancePayment()` for excess handling

#### **Direct Advance Payment Handling**
```javascript
// NEW: Direct customer table operations
if (payment.mode === 'advance') {
  // Check customer's advance balance
  if (customer.advance_amount < paymentAmount) {
    throw new Error(`Insufficient advance balance. Available: ${customer.advance_amount}, Required: ${paymentAmount}`);
  }
  
  // Deduct directly from customers table
  await client.query(
    `UPDATE customers 
     SET advance_amount = advance_amount - $1, 
         updated_at = NOW()
     WHERE id = $2`,
    [paymentAmount, customer.id]
  );
}
```

#### **Excess Payment Handling**
```javascript
// NEW: Simple excess amount handling
const excessAmount = totalPaidAmount - totals.grand_total;
if (excessAmount > 0) {
  // Add directly to customer's advance balance
  await client.query(
    `UPDATE customers 
     SET advance_amount = advance_amount + $1, 
         updated_at = NOW()
     WHERE id = $2`,
    [excessAmount, customer.id]
  );
}
```

### 2. Customer Advance Service Updates (`src/services/customerAdvanceService.js`)

#### **Simplified `addAdvancePayment()` Function**
```javascript
// OLD: Complex advance_payments table management
// NEW: Simple customers table update
async function addAdvancePayment(client, storeId, customerId, amount, referenceType, referenceId, paymentMode, paymentReference, userId, description) {
  // Update customer advance amount directly
  const { rows: [updatedCustomer] } = await client.query(
    `UPDATE customers 
     SET advance_amount = COALESCE(advance_amount, 0) + $1, 
         updated_at = NOW()
     WHERE id = $2
     RETURNING advance_amount`,
    [amount, customerId]
  );

  return { 
    newAdvanceBalance: updatedCustomer.advance_amount,
    historyRecord 
  };
}
```

#### **Simplified `deductAdvancePayment()` Function**
```javascript
// OLD: Complex FIFO logic with advance_payments table
// NEW: Simple balance check and deduction
async function deductAdvancePayment(client, customerId, amount, billId, description) {
  // Get customer's current balance
  const { rows: [customer] } = await client.query(
    `SELECT advance_amount FROM customers WHERE id = $1`,
    [customerId]
  );

  const currentBalance = parseFloat(customer.advance_amount || 0);
  if (currentBalance < amount) {
    throw new Error(`Insufficient advance balance. Available: ${currentBalance}, Required: ${amount}`);
  }

  // Deduct from customer advance amount
  await client.query(
    `UPDATE customers 
     SET advance_amount = advance_amount - $1, 
         updated_at = NOW()
     WHERE id = $2`,
    [amount, customerId]
  );
}
```

#### **Updated `getCustomerAdvancePayments()` Function**
```javascript
// OLD: Query advance_payments table
// NEW: Return balance from customers table in compatible format
async function getCustomerAdvancePayments(customerId, includeUtilized = false) {
  const { rows } = await database.query(
    `SELECT advance_amount FROM customers WHERE id = $1`,
    [customerId]
  );
  
  const balance = parseFloat(rows[0].advance_amount || 0);
  return balance > 0 ? [{
    customer_id: customerId,
    remaining_amount: balance,
    status: 'active'
  }] : [];
}
```

## Database Operations Simplified

### Before (Complex)
- Check `advance_payments` table for available records
- Deduct from multiple records using FIFO logic
- Create `advance_payment_utilizations` records
- Update `customers.advance_amount` as summary
- Complex transaction management

### After (Simple)
- Check `customers.advance_amount` directly
- Update `customers.advance_amount` in single operation
- Create `customer_wallet_history` for audit trail
- Simple transaction management

## Benefits

### 1. **Performance Improvements**
- ✅ **Fewer Database Queries**: Single table operations vs. multi-table joins
- ✅ **Reduced Complexity**: No FIFO logic or utilization tracking
- ✅ **Faster Transactions**: Simpler update operations

### 2. **Simplified Logic**
- ✅ **Easier to Understand**: Single source of truth for advance amounts
- ✅ **Reduced Race Conditions**: Simpler update logic
- ✅ **Less Error-Prone**: Fewer moving parts

### 3. **Maintenance Benefits**
- ✅ **Easier Debugging**: Single table to check for advance balances
- ✅ **Simpler Migrations**: No complex data reconciliation needed
- ✅ **Reduced Storage**: No detailed tracking records needed

## Backward Compatibility

### ✅ **API Compatibility Maintained**
- Same endpoint behavior for advance payments
- Same response format for billing operations
- Same error messages for insufficient balance

### ✅ **Service Function Compatibility**
- `addAdvancePayment()` function signature unchanged
- `deductAdvancePayment()` function signature unchanged
- `getCustomerAdvancePayments()` returns compatible format

### ✅ **Database Compatibility**
- `customers.advance_amount` field remains the same
- `customer_wallet_history` still maintained for audit trail
- No changes to existing customer data

## Migration Impact

### Tables Affected
- ✅ **customers**: Continue to use `advance_amount` field (no changes)
- ✅ **customer_wallet_history**: Continue to track transactions (no changes)
- ⚠️ **advance_payments**: No longer used by application (can be removed in future)
- ⚠️ **advance_payment_utilizations**: No longer used by application (can be removed in future)

### Data Integrity
- ✅ **Existing advance amounts preserved**: All customer balances remain intact
- ✅ **Historical transactions preserved**: Wallet history remains available
- ✅ **No data loss**: All important information retained

## Testing the Fix

The issue reported:
```
"Advance payment failed: No active advance payments found"
```

**Root Cause**: System was looking for records in `advance_payments` table that didn't exist

**Fix Applied**: System now checks `customers.advance_amount` directly

**Expected Result**: Customer with `advance_amount = 50.00` can now use advance payments successfully

### Test Scenario
```json
{
  "customer_id": "57fb6a68-b9ed-4dcb-ae6f-e04422af929e",
  "payments": [
    {
      "mode": "advance",
      "amount": 50,
      "payment_timestamp": "2025-09-27T10:45:15.168Z"
    }
  ]
}
```

**Expected**: ✅ Successfully deducts ₹50 from customer's advance balance
**Before**: ❌ "No active advance payments found" error

## Future Cleanup (Optional)

The following tables can be removed in future migrations if no longer needed:
- `advance_payments` 
- `advance_payment_utilizations`

However, they can also be kept for historical reference without any impact on the application.