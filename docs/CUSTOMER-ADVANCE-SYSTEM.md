# Customer Creation and Advance Payment System

## Overview

This system automatically handles customer creation and advance payment processing for appointments, bookings, and enquiries. When a request is made with a phone number that doesn't exist in the database, a new customer is created. If advance payment is provided, it's tracked in both the customer's advance balance and a detailed advance payments table.

## Features

### 1. Automatic Customer Creation
- **Phone-based lookup**: Uses phone number to find existing customers
- **Auto-creation**: Creates new customer if phone number not found
- **Data preservation**: Saves all available customer information (name, gender, email, address, etc.)
- **Store-scoped**: Customers are unique per store + phone number combination

### 2. Advance Payment Processing
- **Real-time tracking**: Updates customer's advance balance immediately
- **Detailed records**: Maintains comprehensive advance payment history
- **Multiple payments**: Supports multiple advance payments per customer
- **FIFO utilization**: Uses oldest advance payments first when billing
- **Reference tracking**: Links payments to original appointments/bookings

### 3. Integrated Workflow
- **Seamless integration**: Works with existing appointment/booking/enquiry APIs
- **Backward compatibility**: Existing functionality remains unchanged
- **Transaction safety**: All operations within database transactions

## Database Schema

### New Tables

#### `advance_payments`
```sql
- id (UUID): Primary key
- store_id (UUID): Reference to store
- customer_id (UUID): Reference to customer
- reference_type (VARCHAR): 'appointment', 'booking', 'enquiry', 'direct'
- reference_id (UUID): ID of the original transaction
- amount (DECIMAL): Original advance amount
- payment_mode (VARCHAR): 'cash', 'card', 'upi', 'wallet', 'bank_transfer'
- payment_reference (VARCHAR): External payment reference
- status (VARCHAR): 'active', 'utilized', 'refunded', 'expired'
- utilized_amount (DECIMAL): Amount already used in bills
- remaining_amount (DECIMAL): Amount still available
- notes (TEXT): Additional notes
- created_by (UUID): User who created the payment
```

#### `advance_payment_utilizations`
```sql
- id (UUID): Primary key
- advance_payment_id (UUID): Reference to advance payment
- bill_id (UUID): Reference to bill where used
- utilized_amount (DECIMAL): Amount used from this advance payment
```

### Enhanced Tables

#### `customers` (existing)
- `advance_amount`: Total advance balance (sum of all active advance payments)
- Phone number uniqueness enforced per store

#### `customer_wallet_history` (existing)
- Enhanced with advance payment transaction records

## API Integration

### For Appointments

**Request Example:**
```javascript
POST /api/v1/appointments/store/{storeId}
{
  "phoneNumber": "+919876543210",
  "customerName": "John Doe",
  "gender": "male",
  "advanceAmount": 500.00,
  "paymentMode": "upi",
  "services": [...],
  // ... other appointment fields
}
```

**Behavior:**
1. Checks if customer exists with phone `+919876543210`
2. If not found, creates new customer with provided details
3. If `advanceAmount > 0`, adds to customer's advance balance
4. Creates advance payment record linked to appointment
5. Returns appointment with customer information

### For Bookings

**Request Example:**
```javascript
POST /api/v1/bookings/store/{storeId}
{
  "country_code": "+91",
  "contact_no": "9876543210",
  "customer_name": "Jane Smith", 
  "gender": "female",
  "email": "jane@example.com",
  "advance_amount": 300.00,
  "payment_mode": "cash",
  "items": [...],
  // ... other booking fields
}
```

**Behavior:**
1. Constructs full phone: `+919876543210`
2. Finds or creates customer
3. Processes advance payment if provided
4. Links payment to booking record

### For Enquiries

**Request Example:**
```javascript
POST /api/v1/enquiries/store/{storeId}
{
  "country_code": "+91",
  "contact_no": "8765432109",
  "name": "Mike Wilson",
  "gender": "male",
  "enquiry_details": [...],
  // ... other enquiry fields
  // Note: enquiries typically don't have advance_amount
}
```

**Behavior:**
1. Creates customer if phone number not found
2. Links customer to enquiry record
3. No advance payment processing (enquiries are pre-sales)

## Service Functions

### `processCustomerAndAdvance(client, storeId, requestData, recordType, recordId, userId)`

Main function that handles customer creation and advance payment processing.

**Parameters:**
- `client`: Database client for transactions
- `storeId`: UUID of the store
- `requestData`: Request payload containing customer and payment info
- `recordType`: 'appointment', 'booking', 'enquiry', 'direct'
- `recordId`: ID of the record (can be null initially)
- `userId`: ID of the user making the request

**Returns:**
```javascript
{
  customerId: "uuid",
  customer: { /* customer object */ },
  isNewCustomer: boolean,
  advancePaymentRecord: { /* payment record */ } || null
}
```

### `findOrCreateCustomer(client, storeId, customerData)`

Finds existing customer or creates new one based on phone number.

### `addAdvancePayment(client, storeId, customerId, amount, referenceType, referenceId, paymentMode, paymentReference, userId, description)`

Creates advance payment record and updates customer balance.

### `getCustomerAdvancePayments(customerId, includeUtilized)`

Retrieves customer's advance payment history.

### `deductAdvancePayment(client, customerId, amount, billId, description)`

Deducts advance payment when used in billing (FIFO order).

## Usage Examples

### 1. Appointment with New Customer and Advance Payment

```javascript
// In appointment creation API
const appointmentData = {
  phoneNumber: "+919876543210",
  customerName: "John Doe",
  gender: "male", 
  advanceAmount: 500.00,
  paymentMode: "upi",
  services: [...]
};

// The system will:
// 1. Check if customer exists with +919876543210
// 2. Create new customer if not found
// 3. Add ₹500 to customer's advance balance
// 4. Create advance payment record
// 5. Link payment to appointment
```

### 2. Booking with Existing Customer

```javascript
// If customer already exists with same phone number
const bookingData = {
  country_code: "+91",
  contact_no: "9876543210", // Same as above
  customer_name: "John Doe",
  advance_amount: 300.00,
  items: [...]
};

// The system will:
// 1. Find existing customer
// 2. Add ₹300 more to advance balance (total: ₹800)
// 3. Create second advance payment record
// 4. Link to booking
```

### 3. Using Advance Payment in Billing

```javascript
// When creating a bill for the customer
const billData = {
  customer_id: "customer-uuid",
  items: [...],
  payment_mode: "wallet", // Using advance balance
  payment_amount: 600.00
};

// The system will:
// 1. Deduct ₹600 from advance payments (FIFO order)
// 2. First payment: ₹500 fully utilized
// 3. Second payment: ₹100 utilized, ₹200 remaining
// 4. Update customer advance_amount to ₹200
// 5. Create utilization records
```

## Benefits

### 1. Simplified Customer Management
- **No duplicate customers**: Phone-based deduplication
- **Complete profiles**: Captures all available information
- **Consistent data**: Single source of truth per customer

### 2. Comprehensive Advance Tracking
- **Full audit trail**: Every advance payment tracked
- **Flexible utilization**: Use in any future bill
- **Clear reporting**: See advance payment history

### 3. Business Intelligence
- **Customer behavior**: Track advance payment patterns
- **Cash flow**: Monitor advance collections
- **Service linking**: See which services drive advance payments

### 4. Operational Efficiency
- **Automated workflow**: No manual customer creation
- **Integrated payments**: Advance handling built into core flows
- **Staff productivity**: Reduced data entry and errors

## Configuration

### Environment Variables
No additional environment variables required. Uses existing database configuration.

### Database Migrations
Run migration V42 to create advance payment tables:
```bash
npm run db:migrate
```

## Error Handling

### Common Scenarios

#### 1. Invalid Phone Number
```javascript
// Error if phone number format is invalid
{
  "success": false,
  "message": "Phone number information is required"
}
```

#### 2. Insufficient Advance Balance
```javascript
// When trying to use more advance than available
{
  "success": false, 
  "message": "Insufficient advance balance"
}
```

#### 3. Customer Creation Conflicts
```javascript
// Handles duplicate phone numbers gracefully
// Returns existing customer instead of error
```

## Testing

### Test Customer Creation
```javascript
const { processCustomerAndAdvance } = require('./src/services/customerAdvanceService');

const result = await processCustomerAndAdvance(
  client,
  storeId,
  {
    phone_number: "+919876543210",
    name: "Test Customer",
    advance_amount: 500.00
  },
  'appointment',
  appointmentId,
  userId
);

console.log('Customer created:', result.isNewCustomer);
console.log('Advance payment:', result.advancePaymentRecord?.amount);
```

### Run Test Suite
```bash
node test-customer-advance.js
```

## Migration Guide

### Existing Data
- Existing customers remain unchanged
- Existing advance amounts preserved in `customers.advance_amount`
- New advance payments tracked in separate table going forward

### API Changes
- **Backward compatible**: Existing APIs continue to work
- **Enhanced responses**: May include additional customer information
- **New fields**: `isNewCustomer` in some responses

## Monitoring

### Key Metrics
1. **Customer Creation Rate**: New customers per day/week
2. **Advance Payment Volume**: Total advance collected
3. **Utilization Rate**: How quickly advances are used
4. **Customer Retention**: Repeat advance payments

### Database Queries
```sql
-- Daily customer creation
SELECT DATE(created_at), COUNT(*) 
FROM customers 
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at);

-- Advance payment summary
SELECT 
  reference_type,
  COUNT(*) as payments,
  SUM(amount) as total_amount,
  AVG(remaining_amount) as avg_remaining
FROM advance_payments 
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY reference_type;

-- Top customers by advance balance
SELECT 
  c.name,
  c.phone_number,
  c.advance_amount
FROM customers c
WHERE c.advance_amount > 0
ORDER BY c.advance_amount DESC
LIMIT 10;
```

## Support

### Common Issues

1. **Phone format inconsistency**: Ensure consistent E.164 format
2. **Advance balance mismatch**: Check utilization records
3. **Customer duplicates**: Verify phone number normalization

### Troubleshooting

```sql
-- Check customer advance balance consistency
SELECT 
  c.id,
  c.advance_amount as customer_balance,
  COALESCE(SUM(ap.remaining_amount), 0) as payments_remaining
FROM customers c
LEFT JOIN advance_payments ap ON c.id = ap.customer_id AND ap.status = 'active'
WHERE c.advance_amount > 0
GROUP BY c.id, c.advance_amount
HAVING c.advance_amount != COALESCE(SUM(ap.remaining_amount), 0);
```