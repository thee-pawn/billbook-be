const Joi = require('joi');

// Base item schema for bill items
const billItemSchema = Joi.object({
  line_no: Joi.number().integer().min(1).required(),
  type: Joi.string().valid('service', 'product', 'membership').required(),
  id: Joi.string().uuid().required(), // catalog_id
  staff_id: Joi.string().uuid().allow(null).optional(),
  qty: Joi.number().integer().min(1).default(1),
  price: Joi.number().precision(2).min(0).required(), // Unit price
  discount_type: Joi.string().valid('percent', 'flat').required(),
  discount_value: Joi.number().precision(2).min(0).default(0),
  cgst: Joi.number().precision(2).min(0).required(), // Direct CGST amount or rate
  sgst: Joi.number().precision(2).min(0).required()  // Direct SGST amount or rate
});

// Payment schema
const paymentSchema = Joi.object({
  mode: Joi.string().valid('cash', 'card', 'upi', 'wallet', 'advance').required(),
  amount: Joi.number().precision(2).min(0).required(),
  reference: Joi.string().allow(null, '').optional(),
  timestamp: Joi.date().iso().optional(), // Legacy field
  payment_timestamp: Joi.date().iso().optional() // New field
}).or('timestamp', 'payment_timestamp'); // At least one timestamp field required

// Customer creation schema (when customer_id not provided)
const newCustomerSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  gender: Joi.string().trim().max(50).optional(),
  contact_no: Joi.string().trim().pattern(/^\+[1-9]\d{1,14}$/).required(), // E.164 format
  address: Joi.string().trim().max(1000).allow('').optional(),
  email: Joi.string().email().allow('').optional(),
  birthday: Joi.string().trim().max(10).optional(), // Format: DD/MM or similar
  anniversary: Joi.string().trim().max(10).optional() // Format: DD/MM or similar
});

// Base bill schema
const baseBillSchema = {
  customer_id: Joi.string().uuid().optional(),
  customer: newCustomerSchema.optional(),
  customer_details: newCustomerSchema.optional(), // Alternative field name
  coupon_code: Joi.string().trim().max(100).allow(null).optional(),
  coupon_codes: Joi.array().items(Joi.string().trim().max(100)).default([]),
  referral_code: Joi.string().trim().max(100).allow(null).optional(),
  items: Joi.array().items(billItemSchema).min(1).required(),
  discount: Joi.number().precision(2).min(0).default(0),
  payment_mode: Joi.string().valid('cash', 'card', 'upi', 'wallet', 'advance', 'split', 'none').required(),
  payment_amount: Joi.number().precision(2).min(0).default(0),
  payments: Joi.array().items(paymentSchema).default([]),
  billing_timestamp: Joi.date().iso().required(),
  payment_timestamp: Joi.date().iso().optional(),
  appointmentId: Joi.string().uuid().allow(null).optional()
};

// Save bill schema (requires either customer_id, customer, or customer_details)
const saveBillSchema = Joi.object(baseBillSchema).custom((value, helpers) => {
  // Exactly one of customer_id, customer, or customer_details must be provided
  const hasCustomerId = !!value.customer_id;
  const hasCustomer = !!value.customer;
  const hasCustomerDetails = !!value.customer_details;
  const customerFieldsCount = [hasCustomerId, hasCustomer, hasCustomerDetails].filter(Boolean).length;
  
  if (customerFieldsCount > 1) {
    return helpers.error('custom.multiple_customer_fields');
  }
  if (customerFieldsCount === 0) {
    return helpers.error('custom.missing_customer');
  }
  
  // Validate payment semantics
  const paymentSum = value.payments.reduce((sum, p) => sum + p.amount, 0);
  
  if (value.payment_mode === 'none') {
    if (value.payment_amount !== 0) {
      return helpers.error('custom.payment_none_amount');
    }
  } else if (value.payment_mode === 'split') {
    if (value.payments.length < 2) {
      return helpers.error('custom.split_requires_multiple');
    }
    if (Math.abs(paymentSum - value.payment_amount) > 0.01) {
      return helpers.error('custom.payment_amount_mismatch');
    }
  } else {
    // Single payment mode - allow more flexibility for advance payments
    if (value.payments.length !== 1) {
      return helpers.error('custom.single_mode_multiple_payments');
    }
    
    // For advance payments, allow either:
    // 1. payment_mode === 'advance' and payments[0].mode === 'advance'
    // 2. payment_mode can be different when using advance (mixed payment scenario)
    const paymentMode = value.payments[0].mode;
    const isAdvancePayment = paymentMode === 'advance';
    
    if (!isAdvancePayment && paymentMode !== value.payment_mode) {
      return helpers.error('custom.payment_mode_mismatch');
    }
    
    if (Math.abs(paymentSum - value.payment_amount) > 0.01) {
      return helpers.error('custom.payment_amount_mismatch');
    }
  }
  
  return value;
}).messages({
  'custom.multiple_customer_fields': 'Provide only one of: customer_id, customer, or customer_details',
  'custom.missing_customer': 'One of customer_id, customer, or customer_details is required',
  'custom.payment_none_amount': 'payment_amount must be 0 when payment_mode is none',
  'custom.split_requires_multiple': 'payment_mode split requires multiple payments',
  'custom.payment_amount_mismatch': 'payment_amount must equal sum of payments amounts',
  'custom.single_mode_multiple_payments': 'Single payment mode should have exactly one payment',
  'custom.payment_mode_mismatch': 'Payment mode must match payment.mode for single payments'
});

// Hold bill schema (payments are optional)
const holdBillSchema = Joi.object({
  ...baseBillSchema,
  payment_mode: Joi.string().valid('cash', 'card', 'upi', 'wallet', 'advance', 'split', 'none').default('none'),
  payment_amount: Joi.number().precision(2).min(0).default(0),
  payments: Joi.array().items(paymentSchema).default([]),
  payment_timestamp: Joi.date().iso().optional()
}).custom((value, helpers) => {
  // Exactly one of customer_id, customer, or customer_details must be provided
  const hasCustomerId = !!value.customer_id;
  const hasCustomer = !!value.customer;
  const hasCustomerDetails = !!value.customer_details;
  
  const customerFieldsCount = [hasCustomerId, hasCustomer, hasCustomerDetails].filter(Boolean).length;
  
  if (customerFieldsCount > 1) {
    return helpers.error('custom.multiple_customer_fields');
  }
  if (customerFieldsCount === 0) {
    return helpers.error('custom.missing_customer');
  }
  
  return value;
}).messages({
  'custom.multiple_customer_fields': 'Provide only one of: customer_id, customer, or customer_details',
  'custom.missing_customer': 'One of customer_id, customer, or customer_details is required'
});

// List bills query schema
const listBillsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  q: Joi.string().trim().max(255).optional(), // Search term
  sort: Joi.string().valid('date_asc', 'date_desc', 'amount_asc', 'amount_desc').optional(),
  status: Joi.string().valid('paid', 'partial', 'unpaid').optional()
});

// List held bills query schema
const listHeldBillsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50)
});

// Path parameter schemas
const storeIdParamSchema = Joi.object({
  storeId: Joi.string().uuid().required()
});

const heldIdParamSchema = Joi.object({
  storeId: Joi.string().uuid().required(),
  heldId: Joi.string().uuid().required()
});

const billIdParamSchema = Joi.object({
  storeId: Joi.string().uuid().required(),
  billId: Joi.string().uuid().required()
});

// Customer bills query schema
const customerBillsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  sort: Joi.string().valid('date_asc', 'date_desc', 'amount_asc', 'amount_desc').default('date_desc'),
  due_only: Joi.boolean().default(false) // Filter for bills with pending dues
});

// Customer ID parameter schema
const customerIdParamSchema = Joi.object({
  storeId: Joi.string().uuid().required(),
  customerId: Joi.string().uuid().required()
});

// Delete bills schema
const deleteBillsSchema = Joi.object({
  bill_ids: Joi.array().items(Joi.string().uuid()).min(1).max(50).required()
});

module.exports = {
  saveBillSchema,
  holdBillSchema,
  listBillsQuerySchema,
  listHeldBillsQuerySchema,
  customerBillsQuerySchema,
  storeIdParamSchema,
  heldIdParamSchema,
  billIdParamSchema,
  customerIdParamSchema,
  deleteBillsSchema
};