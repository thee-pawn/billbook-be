const database = require('../config/database');

/**
 * Customer and Advance Payment Service
 * Handles customer creation and advance payment processing for appointments/bookings/enquiries
 */

/**
 * Generate a unique referral code
 */
async function generateReferralCode(client) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  let isUnique = false;
  
  while (!isUnique) {
    result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    const { rows } = await client.query(
      'SELECT 1 FROM customers WHERE referral_code = $1 LIMIT 1',
      [result]
    );
    
    if (rows.length === 0) {
      isUnique = true;
    }
  }
  
  return result;
}

/**
 * Create a new customer with the provided details
 */
async function createCustomer(client, storeId, customerData) {
  const {
    phone_number,
    name = '',
    gender = null,
    email = null,
    address = '',
    birthday = null,
    anniversary = null
  } = customerData;

  // Generate unique referral code
  const referralCode = await generateReferralCode(client);

  const insertQuery = `
    INSERT INTO customers (
      store_id, phone_number, name, gender, birthday, anniversary, address,
      loyalty_points, wallet_balance, dues, advance_amount, last_visit,
      referral_code, status, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, 0, 0.00, 0.00, 0.00, NOW(), $8, 'active', NOW(), NOW()
    ) RETURNING *`;

  const { rows: [customer] } = await client.query(insertQuery, [
    storeId, phone_number, name, gender, birthday, anniversary, address, referralCode
  ]);

  return customer;
}

/**
 * Find or create customer by phone number
 * Returns { customer, isNewCustomer }
 */
async function findOrCreateCustomer(client, storeId, customerData) {
  const { country_code, contact_no, phone_number } = customerData;
  
  // Determine the full phone number
  let fullPhoneNumber;
  if (phone_number) {
    fullPhoneNumber = phone_number;
  } else if (country_code && contact_no) {
    fullPhoneNumber = `${country_code}${contact_no}`;
  } else {
    throw new Error('Phone number information is required');
  }

  // First, try to find existing customer
  const { rows: existingCustomers } = await client.query(
    'SELECT * FROM customers WHERE store_id = $1 AND phone_number = $2 LIMIT 1',
    [storeId, fullPhoneNumber]
  );

  if (existingCustomers.length > 0) {
    return {
      customer: existingCustomers[0],
      isNewCustomer: false
    };
  }

  // Customer doesn't exist, create new one
  const newCustomerData = {
    ...customerData,
    phone_number: fullPhoneNumber
  };

  const customer = await createCustomer(client, storeId, newCustomerData);

  return {
    customer,
    isNewCustomer: true
  };
}

/**
 * Add advance payment to customer account and create advance payment record
 */
async function addAdvancePayment(client, storeId, customerId, amount, referenceType, referenceId, paymentMode, paymentReference, userId, description) {
  if (!amount || amount <= 0) {
    return null;
  }

  // Update customer advance amount directly
  const { rows: [updatedCustomer] } = await client.query(
    `UPDATE customers 
     SET advance_amount = COALESCE(advance_amount, 0) + $1, 
         updated_at = NOW()
     WHERE id = $2
     RETURNING advance_amount`,
    [amount, customerId]
  );

  // Create wallet history record for backward compatibility
  const { rows: [historyRecord] } = await client.query(
    `INSERT INTO customer_wallet_history (
       customer_id, amount, transaction_type, transaction_reference_id, description, created_at
     ) VALUES ($1, $2, 'credit', $3, $4, NOW())
     RETURNING *`,
    [customerId, amount, referenceId, description]
  );

  return { 
    newAdvanceBalance: updatedCustomer.advance_amount,
    historyRecord 
  };
}

/**
 * Process customer and advance payment for appointments/bookings/enquiries
 * This is the main function to be called from appointment/booking/enquiry services
 */
async function processCustomerAndAdvance(client, storeId, requestData, recordType, recordId, userId) {
  const {
    customer_id,
    advance_amount,
    country_code,
    contact_no,
    phone_number,
    customer_name,
    name,
    gender,
    email,
    address,
    birthday,
    anniversary,
    payment_mode,
    payment_reference
  } = requestData;

  let customerId = customer_id;
  let customer = null;
  let isNewCustomer = false;

  // If customer_id is not provided, try to find or create customer
  if (!customerId && (phone_number || (country_code && contact_no))) {
    const customerData = {
      country_code,
      contact_no,
      phone_number,
      name: name || customer_name || '',
      gender: gender || null,
      email: email || null,
      address: address || '',
      birthday: birthday || null,
      anniversary: anniversary || null
    };

    const result = await findOrCreateCustomer(client, storeId, customerData);
    customer = result.customer;
    customerId = customer.id;
    isNewCustomer = result.isNewCustomer;
  } else if (customerId) {
    // Get existing customer details
    const { rows: existingCustomers } = await client.query(
      'SELECT * FROM customers WHERE id = $1 AND store_id = $2 LIMIT 1',
      [customerId, storeId]
    );
    
    if (existingCustomers.length > 0) {
      customer = existingCustomers[0];
    }
  }

  // Process advance payment if amount is provided and we have a customer
  let advancePaymentRecord = null;
  if (customerId && advance_amount && advance_amount > 0) {
    const description = `Advance payment for ${recordType}${recordId ? ` #${recordId}` : ''}`;
    advancePaymentRecord = await addAdvancePayment(
      client,
      storeId,
      customerId,
      advance_amount,
      recordType,
      recordId,
      payment_mode || 'cash',
      payment_reference || null,
      userId,
      description
    );
  }

  return {
    customerId,
    customer,
    isNewCustomer,
    advancePaymentRecord
  };
}

/**
 * Get customer's current advance balance
 */
async function getCustomerAdvanceBalance(customerId) {
  const { rows } = await database.query(
    'SELECT advance_amount FROM customers WHERE id = $1',
    [customerId]
  );
  
  return rows.length > 0 ? parseFloat(rows[0].advance_amount) : 0;
}

/**
 * Get customer's wallet transaction history
 */
async function getCustomerWalletHistory(customerId, limit = 50, offset = 0) {
  const { rows } = await database.query(
    `SELECT * FROM customer_wallet_history 
     WHERE customer_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2 OFFSET $3`,
    [customerId, limit, offset]
  );
  
  return rows;
}

/**
 * Deduct advance amount from customer (when advance is used in billing)
 */
async function deductAdvancePayment(client, customerId, amount, billId, description) {
  if (!amount || amount <= 0) {
    return null;
  }

  // Get customer's current advance balance directly from customers table
  const { rows: [customer] } = await client.query(
    `SELECT advance_amount FROM customers WHERE id = $1`,
    [customerId]
  );

  if (!customer) {
    throw new Error('Customer not found');
  }

  const currentBalance = parseFloat(customer.advance_amount || 0);
  if (currentBalance < amount) {
    throw new Error(`Insufficient advance balance. Available: ${currentBalance}, Required: ${amount}`);
  }

  // Deduct from customer advance amount
  const { rows: [updatedCustomer] } = await client.query(
    `UPDATE customers 
     SET advance_amount = advance_amount - $1, 
         updated_at = NOW()
     WHERE id = $2
     RETURNING advance_amount`,
    [amount, customerId]
  );

  // Create wallet history record (negative amount for debit)
  const { rows: [historyRecord] } = await client.query(
    `INSERT INTO customer_wallet_history (
       customer_id, amount, transaction_type, transaction_reference_id, description, created_at
     ) VALUES ($1, $2, 'debit', $3, $4, NOW())
     RETURNING *`,
    [customerId, -amount, billId, description]
  );

  return { 
    historyRecord,
    totalDeducted: amount,
    newAdvanceBalance: updatedCustomer.advance_amount
  };
}

/**
 * Get customer's advance balance (simplified to use customers table only)
 */
async function getCustomerAdvancePayments(customerId, includeUtilized = false) {
  const { rows } = await database.query(
    `SELECT advance_amount FROM customers WHERE id = $1`,
    [customerId]
  );
  
  // Return balance in a format similar to the old structure for compatibility
  if (rows.length === 0) {
    return [];
  }
  
  const balance = parseFloat(rows[0].advance_amount || 0);
  if (balance <= 0) {
    return [];
  }
  
  return [{
    customer_id: customerId,
    remaining_amount: balance,
    status: 'active'
  }];
}

module.exports = {
  findOrCreateCustomer,
  createCustomer,
  addAdvancePayment,
  processCustomerAndAdvance,
  getCustomerAdvanceBalance,
  getCustomerWalletHistory,
  deductAdvancePayment,
  getCustomerAdvancePayments
};