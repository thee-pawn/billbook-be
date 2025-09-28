# Advance Payment Validation Fix

## Issue Fixed
The billing validation was rejecting advance payments with the error:
```
"Payment mode must match payment.mode for single payments"
```

## Root Cause
The validation was too strict for advance payments. It required:
- `payment_mode` === `payments[0].mode`

But when using advance payments, you might have scenarios like:
```json
{
  "payment_mode": "cash",      // Overall transaction mode
  "payments": [
    {
      "mode": "advance",       // Payment from advance balance
      "amount": 117.5
    }
  ]
}
```

## Solution Applied
Updated the validation logic in `src/utils/billingValidation.js` to allow advance payments with flexible payment modes:

### Before (Strict):
```javascript
if (value.payments[0].mode !== value.payment_mode) {
  return helpers.error('custom.payment_mode_mismatch');
}
```

### After (Flexible for Advance):
```javascript
// For advance payments, allow either:
// 1. payment_mode === 'advance' and payments[0].mode === 'advance'
// 2. payment_mode can be different when using advance (mixed payment scenario)
const paymentMode = value.payments[0].mode;
const isAdvancePayment = paymentMode === 'advance';

if (!isAdvancePayment && paymentMode !== value.payment_mode) {
  return helpers.error('custom.payment_mode_mismatch');
}
```

## Valid Scenarios Now Allowed

### 1. Pure Advance Payment
```json
{
  "payment_mode": "advance",
  "payment_amount": 117.5,
  "payments": [
    {
      "mode": "advance",
      "amount": 117.5
    }
  ]
}
```

### 2. Advance Payment with Different Overall Mode
```json
{
  "payment_mode": "cash",      // ✅ Now allowed
  "payment_amount": 117.5,
  "payments": [
    {
      "mode": "advance",       // ✅ Advance payment is flexible
      "amount": 117.5
    }
  ]
}
```

### 3. Regular Payments (Still Strict)
```json
{
  "payment_mode": "cash",
  "payment_amount": 100.0,
  "payments": [
    {
      "mode": "cash",          // ✅ Must match for non-advance
      "amount": 100.0
    }
  ]
}
```

## Frontend Integration Impact

### Held Invoice Loading
Your held invoice payload will now work:
```json
{
  "payment_mode": "cash",
  "payments": [
    {
      "mode": "advance",
      "amount": 117.5,
      "reference": null,
      "payment_timestamp": "2025-09-27T13:22:40.821Z"
    }
  ]
}
```

### Advance Payment Best Practices

#### Option 1: Set payment_mode to "advance"
```javascript
const billData = {
  // ... other fields
  payment_mode: "advance",     // Recommended for pure advance payments
  payment_amount: 117.5,
  payments: [
    {
      mode: "advance",
      amount: 117.5,
      payment_timestamp: new Date().toISOString()
    }
  ]
};
```

#### Option 2: Mixed payment indication
```javascript
const billData = {
  // ... other fields
  payment_mode: "split",       // Use split for mixed payment types
  payment_amount: 217.5,
  payments: [
    {
      mode: "advance",
      amount: 117.5
    },
    {
      mode: "cash",
      amount: 100.0
    }
  ]
};
```

## Error Messages Improved

The validation now provides better context:
- ✅ Advance payments bypass the strict mode matching
- ❌ Non-advance payments still require exact mode matching
- 📝 Clear error messages for actual mismatches

## Testing

Test these scenarios:

### Should Work ✅
```bash
# Pure advance payment
POST /api/v1/billing/{storeId}/bills
{
  "payment_mode": "advance",
  "payments": [{"mode": "advance", "amount": 100}]
}

# Advance with different overall mode
POST /api/v1/billing/{storeId}/bills  
{
  "payment_mode": "cash",
  "payments": [{"mode": "advance", "amount": 100}]
}
```

### Should Fail ❌
```bash
# Non-advance payment mode mismatch
POST /api/v1/billing/{storeId}/bills
{
  "payment_mode": "cash",
  "payments": [{"mode": "card", "amount": 100}]  // ❌ Mismatch
}
```

## Summary
Advance payments now have flexible validation while maintaining strict validation for regular payment modes. This allows the billing system to handle advance balance deductions properly without requiring exact payment mode matching.

Date: 2025-09-27