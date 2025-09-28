# Billing API Payload Structure Updates

This document explains the changes made to support the new billing payload structure.

## Overview

The billing API has been updated to handle a new payload format with the following key changes:
1. Items now include direct `price` field instead of relying on catalog prices
2. Payments use `payment_timestamp` instead of `timestamp`
3. Support for `customer_details` field as alternative to `customer`
4. CGST/SGST can be provided as rates or direct amounts

## New Payload Structure

### Example Request
```json
{
    "customer_id": "57fb6a68-b9ed-4dcb-ae6f-e04422af929e",
    "coupon_code": null,
    "coupon_codes": [],
    "referral_code": "EJM0AR0C",
    "items": [
        {
            "line_no": 1,
            "type": "service",
            "id": "b40ad059-aaee-4fe1-9884-15b895e50b68",
            "staff_id": "256b3443-e5c1-45e9-9aed-5c0c18e3aaa7",
            "qty": 1,
            "price": 99.58,           // NEW: Direct unit price
            "discount_type": "percent",
            "discount_value": 0,
            "cgst": 8.96,            // NEW: Direct tax amounts or rates
            "sgst": 8.96             // NEW: Direct tax amounts or rates
        }
    ],
    "discount": 0,
    "payment_mode": "split",
    "payment_amount": 117.5,
    "payments": [
        {
            "mode": "cash",
            "amount": 67.5,
            "reference": null,
            "payment_timestamp": "2025-09-27T10:15:24.080Z"  // NEW: Field name
        },
        {
            "mode": "advance",
            "amount": 50,
            "reference": null,
            "payment_timestamp": "2025-09-27T10:15:24.080Z"  // NEW: Field name
        }
    ],
    "billing_timestamp": "2025-09-27T10:15:00.000Z"
}
```

## Changes Made

### 1. Validation Schema Updates (`src/utils/billingValidation.js`)

#### Item Schema Changes
- ✅ Added `price` field as required for direct unit pricing
- ✅ Updated CGST/SGST to handle both rates and amounts
- ✅ Maintained backward compatibility with existing structure

#### Payment Schema Changes  
- ✅ Added support for `payment_timestamp` field
- ✅ Made both `timestamp` and `payment_timestamp` optional with OR validation
- ✅ Ensures at least one timestamp field is provided

#### Customer Field Support
- ✅ Added support for `customer_details` as alternative to `customer`
- ✅ Updated validation to allow one of: `customer_id`, `customer`, or `customer_details`
- ✅ Enhanced error messages for better clarity

### 2. Billing Service Updates (`src/services/billingService.js`)

#### New Calculation Method
- ✅ Added `calculateLineItemFromPrice()` method for new payload format
- ✅ Intelligent tax handling: detects rates vs amounts automatically
- ✅ Supports CGST/SGST as percentages (0-100) or direct amounts

#### Customer Resolution Enhancement
- ✅ Updated `resolveCustomer()` to handle `customer_details` field
- ✅ Maintains backward compatibility with existing `customer` field

#### Item Processing Logic
- ✅ Automatic detection of payload format (price field presence)
- ✅ Uses appropriate calculation method based on format
- ✅ Applied to both `saveBillTransaction` and `holdBillTransaction`

#### Payment Timestamp Handling
- ✅ Updated payment processing to use `payment_timestamp` or `timestamp`
- ✅ Works with both advance payments and regular payment modes
- ✅ Maintains database compatibility

## Tax Amount Detection Logic

The system intelligently detects how CGST/SGST values should be interpreted:

```javascript
if (value < 1) {
    // Treat as decimal rate (e.g., 0.09 = 9%)
    taxAmount = baseAmount * value;
} else if (value <= 100) {
    // Treat as percentage rate (e.g., 9 = 9%)
    taxAmount = baseAmount * (value / 100);
} else {
    // Treat as direct amount (e.g., 8.96 = ₹8.96)
    taxAmount = value;
}
```

## Backward Compatibility

The implementation maintains full backward compatibility:

### Legacy Format (Still Supported)
```json
{
    "customer": {
        "name": "John Doe",
        "contact_no": "+911234567890"
    },
    "items": [
        {
            "line_no": 1,
            "type": "service", 
            "id": "service-uuid",
            "qty": 1,
            "discount_type": "percent",
            "discount_value": 0,
            "cgst": 9,    // Percentage rate
            "sgst": 9     // Percentage rate
        }
    ],
    "payments": [
        {
            "mode": "cash",
            "amount": 100,
            "timestamp": "2025-09-27T10:15:24.080Z"  // Legacy field
        }
    ]
}
```

### New Format (Enhanced)
```json
{
    "customer_details": {
        "name": "Jane Doe", 
        "contact_no": "+911234567890"
    },
    "items": [
        {
            "line_no": 1,
            "type": "service",
            "id": "service-uuid", 
            "price": 99.58,     // Direct price
            "qty": 1,
            "cgst": 8.96,       // Direct amount
            "sgst": 8.96        // Direct amount
        }
    ],
    "payments": [
        {
            "mode": "advance",
            "amount": 50,
            "payment_timestamp": "2025-09-27T10:15:24.080Z"  // New field
        }
    ]
}
```

## API Response

Both formats return identical response structure using the shared `getBillDetails()` function:

```json
{
    "success": true,
    "message": "Bill saved successfully",
    "data": {
        "bill": {
            "id": "bill-uuid",
            "invoice_number": "INV2025000001",
            "customer": { /* customer details */ },
            "store": { /* store details */ },
            "items": [ /* processed line items */ ],
            "payments": [ /* payment records */ ],
            "totals": { /* calculated totals */ }
        },
        "excessAmountAddedToAdvance": null  // If applicable
    }
}
```

## Benefits

1. **Flexible Pricing**: Support for dynamic pricing without catalog dependency
2. **Enhanced Tax Handling**: Smart detection of tax rates vs amounts
3. **Modern Field Names**: Clearer field naming conventions
4. **Backward Compatibility**: Seamless support for existing integrations
5. **Customer Flexibility**: Multiple ways to specify customer information
6. **Advance Payments**: Full integration with customer advance system

## Testing

The updated system should be tested with:
- ✅ New payload format with direct prices and payment_timestamp
- ✅ Legacy payload format with catalog prices and timestamp  
- ✅ Mixed scenarios with customer_id, customer, and customer_details
- ✅ Various tax amount formats (rates, percentages, amounts)
- ✅ Advance payment scenarios with excess handling