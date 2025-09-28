# Advance Payment in Billing API

This document explains the advance payment functionality in the billing API.

## Overview

The billing API now supports advance payments as a payment mode. This allows customers to:
1. Pay for bills using their existing advance balance
2. Add excess payment amounts to their advance balance automatically

## How It Works

### 1. Using Advance Payments

When creating a bill, you can include advance as a payment mode:

```json
{
  "customer_id": "customer-uuid",
  "items": [...],
  "payments": [
    {
      "mode": "advance",
      "amount": 500.00,
      "reference": "Advance payment",
      "timestamp": "2024-01-01T10:00:00.000Z"
    }
  ],
  "billing_timestamp": "2024-01-01T10:00:00.000Z"
}
```

### 2. Advance Deduction Logic

- The system automatically deducts the specified amount from the customer's available advance balance
- Uses FIFO (First In, First Out) principle for advance utilization
- Creates proper audit trail in `advance_payment_utilizations` table
- Updates customer's remaining advance balance

### 3. Excess Payment Handling

If the total payment amount exceeds the bill total:

```json
{
  "payments": [
    {
      "mode": "cash",
      "amount": 1200.00,
      "timestamp": "2024-01-01T10:00:00.000Z"
    }
  ]
}
```

For a bill total of ₹1000:
- ₹1000 is applied to the bill
- ₹200 excess is automatically added to customer's advance balance
- Customer can use this ₹200 for future purchases

### 4. Mixed Payment Modes

You can combine advance with other payment modes:

```json
{
  "payments": [
    {
      "mode": "advance",
      "amount": 300.00,
      "reference": "Advance payment",
      "timestamp": "2024-01-01T10:00:00.000Z"
    },
    {
      "mode": "cash",
      "amount": 700.00,
      "timestamp": "2024-01-01T10:00:00.000Z"
    }
  ]
}
```

## API Response

The API response includes information about advance usage:

```json
{
  "success": true,
  "message": "Bill saved successfully",
  "data": {
    "bill": {
      "id": "bill-uuid",
      "invoice_number": "INV-001",
      "paid_amount": 1000.00,
      "dues": 0.00,
      "status": "paid"
    },
    "excessAmountAddedToAdvance": 200.00  // Only present if excess was added
  }
}
```

## Error Handling

### Insufficient Advance Balance

If customer doesn't have enough advance balance:

```json
{
  "success": false,
  "message": "Advance payment failed: No active advance payments found"
}
```

### Invalid Customer

If customer ID is invalid:

```json
{
  "success": false,
  "message": "Customer not found in this store"
}
```

## Database Changes

### Advance Payment Tracking
- All advance deductions are tracked in `advance_payment_utilizations`
- Maintains FIFO order for advance usage
- Provides complete audit trail

### Customer Balance Updates
- Customer's `advance_amount` is updated in real-time
- Excess payments automatically increase advance balance
- Compatible with existing wallet history system

## Validation

The following payment modes are now valid:
- `cash`
- `card` 
- `upi`
- `wallet`
- `advance` (new)
- `split`
- `none`

## Benefits

1. **Automatic Processing**: No manual intervention required for advance deduction/addition
2. **Audit Trail**: Complete tracking of all advance transactions
3. **FIFO Logic**: Ensures proper utilization order of advance payments  
4. **Excess Handling**: Automatically converts overpayments to advance balance
5. **Mixed Payments**: Supports combination of advance with other payment modes
6. **Error Recovery**: Proper error handling for insufficient balance scenarios

## Example Usage

### Scenario 1: Pure Advance Payment
- Bill Total: ₹800
- Customer Advance: ₹1000
- Payment: ₹800 advance
- Result: Bill paid, ₹200 advance remaining

### Scenario 2: Partial Advance Payment  
- Bill Total: ₹1000
- Customer Advance: ₹300
- Payments: ₹300 advance + ₹700 cash
- Result: Bill paid, ₹0 advance remaining

### Scenario 3: Excess Payment
- Bill Total: ₹500
- Payment: ₹800 cash
- Result: Bill paid, ₹300 added to advance balance