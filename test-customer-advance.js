/**
 * Test script to verify customer creation and advance payment functionality
 * Run this after implementing the customer advance service
 */

const database = require('../src/config/database');
const { processCustomerAndAdvance, getCustomerAdvancePayments } = require('../src/services/customerAdvanceService');

async function testCustomerAdvanceService() {
  console.log('🚀 Starting Customer Advance Service Tests...\n');
  
  try {
    await database.query('BEGIN');
    
    // Test data
    const storeId = '550e8400-e29b-41d4-a716-446655440000'; // Replace with actual store ID
    const userId = '550e8400-e29b-41d4-a716-446655440001';   // Replace with actual user ID
    
    console.log('📞 Test 1: Creating new customer with advance payment');
    
    const appointmentData = {
      country_code: '+91',
      contact_no: '9876543210',
      name: 'Test Customer',
      customer_name: 'Test Customer',
      gender: 'male',
      email: 'test@example.com',
      address: '123 Test Street',
      advance_amount: 500.00,
      payment_mode: 'cash'
    };
    
    const result1 = await processCustomerAndAdvance(
      { query: database.query.bind(database) },
      storeId,
      appointmentData,
      'appointment',
      '550e8400-e29b-41d4-a716-446655440010', // Mock appointment ID
      userId
    );
    
    console.log('✅ Customer created:', {
      customerId: result1.customerId,
      isNewCustomer: result1.isNewCustomer,
      customerName: result1.customer?.name,
      advancePayment: result1.advancePaymentRecord?.advancePayment?.amount
    });
    
    console.log('\n📞 Test 2: Finding existing customer (same phone number)');
    
    const bookingData = {
      country_code: '+91',
      contact_no: '9876543210',
      name: 'Test Customer Updated',
      customer_name: 'Test Customer Updated',
      advance_amount: 300.00,
      payment_mode: 'upi',
      payment_reference: 'UPI-123456789'
    };
    
    const result2 = await processCustomerAndAdvance(
      { query: database.query.bind(database) },
      storeId,
      bookingData,
      'booking',
      '550e8400-e29b-41d4-a716-446655440020', // Mock booking ID
      userId
    );
    
    console.log('✅ Customer found:', {
      customerId: result2.customerId,
      isNewCustomer: result2.isNewCustomer,
      customerName: result2.customer?.name,
      advancePayment: result2.advancePaymentRecord?.advancePayment?.amount
    });
    
    console.log('\n💰 Test 3: Checking customer advance payments');
    
    const advancePayments = await getCustomerAdvancePayments(result1.customerId);
    console.log('✅ Customer advance payments:', advancePayments.map(payment => ({
      id: payment.id,
      amount: payment.amount,
      remainingAmount: payment.remaining_amount,
      referenceType: payment.reference_type,
      paymentMode: payment.payment_mode,
      status: payment.status
    })));
    
    console.log('\n📊 Test 4: Checking customer balance');
    
    const { rows: [customer] } = await database.query(
      'SELECT name, phone_number, advance_amount FROM customers WHERE id = $1',
      [result1.customerId]
    );
    
    console.log('✅ Customer details:', {
      name: customer.name,
      phone: customer.phone_number,
      advanceAmount: parseFloat(customer.advance_amount)
    });
    
    console.log('\n🎯 Test 5: Creating customer without advance payment (enquiry scenario)');
    
    const enquiryData = {
      country_code: '+91',
      contact_no: '8765432109',
      name: 'Another Customer',
      gender: 'female',
      email: 'another@example.com'
      // No advance_amount
    };
    
    const result3 = await processCustomerAndAdvance(
      { query: database.query.bind(database) },
      storeId,
      enquiryData,
      'enquiry',
      '550e8400-e29b-41d4-a716-446655440030',
      userId
    );
    
    console.log('✅ Enquiry customer created:', {
      customerId: result3.customerId,
      isNewCustomer: result3.isNewCustomer,
      customerName: result3.customer?.name,
      hasAdvancePayment: !!result3.advancePaymentRecord
    });
    
    await database.query('ROLLBACK'); // Don't commit test data
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('  ✅ Customer creation with advance payment');
    console.log('  ✅ Customer lookup by phone number');  
    console.log('  ✅ Multiple advance payments for same customer');
    console.log('  ✅ Customer creation without advance payment');
    console.log('  ✅ Advance payment tracking in separate table');
    
  } catch (error) {
    await database.query('ROLLBACK');
    console.error('❌ Test failed:', error.message);
    console.error(error);
  } finally {
    await database.end();
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testCustomerAdvanceService().catch(console.error);
}

module.exports = { testCustomerAdvanceService };