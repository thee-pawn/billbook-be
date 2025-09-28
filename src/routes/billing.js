const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { validate, validateParams, validateQuery } = require('../middleware/validation');
const { generalLimiter } = require('../middleware/rateLimiter');
const database = require('../config/database');
const billingService = require('../services/billingService');
const {
  saveBillSchema,
  holdBillSchema,
  listBillsQuerySchema,
  listHeldBillsQuerySchema,
  customerBillsQuerySchema,
  storeIdParamSchema,
  heldIdParamSchema,
  billIdParamSchema,
  customerIdParamSchema
} = require('../utils/billingValidation');

// Helper function to check store access
async function checkStoreAccess(storeId, userId) {
  try {
    const result = await database.query(
      `SELECT su.role 
       FROM store_users su 
       WHERE su.store_id = $1 AND su.user_id = $2`,
      [storeId, userId]
    );
    
    return result.rows.length > 0 ? result.rows[0].role : null;
  } catch (error) {
    return null;
  }
}

// Helper for transaction execution
async function withTransaction(fn) {
  const client = await database.getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Helper function to get complete bill details (used by both POST and GET)
async function getBillDetails(billId, storeId) {
  // Get bill details with all related information
  const billQuery = `
    SELECT 
      b.*,
      c.name as customer_name,
      c.phone_number as customer_phone,
      c.gender as customer_gender,
      c.address as customer_address,
      c.birthday as customer_birthday,
      c.anniversary as customer_anniversary,
      s.name as store_name,
      s.address_line_1 as store_address_line_1,
      s.locality as store_locality,
      s.city as store_city,
      s.state as store_state,
      s.country as store_country,
      s.pincode as store_pincode,
      s.mobile_no as store_phone,
      s.contact_email_id as store_email,
      s.gst_number as store_gstin,
      s.logo_url as store_logo
    FROM bills b
    LEFT JOIN customers c ON b.customer_id = c.id
    LEFT JOIN stores s ON b.store_id = s.id
    WHERE b.id = $1 AND b.store_id = $2
  `;

  const { rows: billRows } = await database.query(billQuery, [billId, storeId]);
  
  if (billRows.length === 0) {
    return null;
  }

  const bill = billRows[0];

  // Get bill items
  const itemsQuery = `
    SELECT 
      bi.*,
      CASE 
        WHEN bi.type = 'service' THEN srv.name
        WHEN bi.type = 'product' THEN prod.name
        WHEN bi.type = 'membership' THEN mem.name
      END as item_name,
      CASE 
        WHEN bi.type = 'service' THEN srv.description
        WHEN bi.type = 'product' THEN prod.description
        WHEN bi.type = 'membership' THEN mem.description
      END as item_description,
      staff.name as staff_name
    FROM bill_items bi
    LEFT JOIN services srv ON bi.type = 'service' AND bi.catalog_id = srv.id
    LEFT JOIN products prod ON bi.type = 'product' AND bi.catalog_id = prod.id
    LEFT JOIN memberships mem ON bi.type = 'membership' AND bi.catalog_id = mem.id
    LEFT JOIN staff ON bi.staff_id = staff.id
    WHERE bi.bill_id = $1
    ORDER BY bi.line_no ASC
  `;

  const { rows: itemsRows } = await database.query(itemsQuery, [billId]);

  // Get payment records
  const paymentsQuery = `
    SELECT * FROM bill_payments 
    WHERE bill_id = $1 
    ORDER BY timestamp ASC
  `;

  const { rows: paymentsRows } = await database.query(paymentsQuery, [billId]);

  // Format the response
  return {
    bill: {
      id: bill.id,
      invoice_number: bill.invoice_number,
      created_at: bill.created_at,
      updated_at: bill.updated_at,
      billing_timestamp: bill.billing_timestamp,
      payment_timestamp: bill.payment_timestamp,
      
      // Customer details
      customer: bill.customer_id ? {
        id: bill.customer_id,
        name: bill.customer_name,
        phone_number: bill.customer_phone,
        gender: bill.customer_gender,
        address: bill.customer_address,
        birthday: bill.customer_birthday,
        anniversary: bill.customer_anniversary
      } : null,

      // Store details
      store: {
        id: bill.store_id,
        name: bill.store_name,
        address: {
          address_line_1: bill.store_address_line_1,
          locality: bill.store_locality,
          city: bill.store_city,
          state: bill.store_state,
          country: bill.store_country,
          pincode: bill.store_pincode,
          full_address: [
            bill.store_address_line_1,
            bill.store_locality,
            bill.store_city,
            bill.store_state,
            bill.store_country,
            bill.store_pincode
          ].filter(Boolean).join(', ')
        },
        phone_number: bill.store_phone,
        email: bill.store_email,
        gstin: bill.store_gstin,
        logo_url: bill.store_logo
      },

      // Bill items with details
      items: itemsRows.map(item => ({
        line_no: item.line_no,
        type: item.type,
        catalog_id: item.catalog_id,
        name: item.item_name,
        description: item.item_description,
        staff_id: item.staff_id,
        staff_name: item.staff_name,
        quantity: item.quantity,
        unit_price: parseFloat(item.unit_price),
        discount_type: item.discount_type,
        discount_value: parseFloat(item.discount_value || 0),
        cgst_rate: parseFloat(item.cgst_rate),
        sgst_rate: parseFloat(item.sgst_rate),
        base_amount: parseFloat(item.base_amount),
        discount_amount: parseFloat(item.discount_amount),
        taxable_amount: parseFloat(item.taxable_amount),
        cgst_amount: parseFloat(item.cgst_amount),
        sgst_amount: parseFloat(item.sgst_amount),
        tax_amount: parseFloat(item.tax_amount),
        line_total: parseFloat(item.line_total)
      })),

      // Payment records
      payments: paymentsRows.map(payment => ({
        id: payment.id,
        mode: payment.mode,
        amount: parseFloat(payment.amount),
        reference: payment.reference,
        timestamp: payment.timestamp,
        created_at: payment.created_at
      })),

      // Bill totals
      totals: {
        sub_total: parseFloat(bill.sub_total),
        discount: parseFloat(bill.discount || 0),
        tax_amount: parseFloat(bill.tax_amount),
        cgst_amount: parseFloat(bill.cgst_amount),
        sgst_amount: parseFloat(bill.sgst_amount),
        grand_total: parseFloat(bill.grand_total),
        paid: parseFloat(bill.paid_amount),
        dues: parseFloat(bill.dues),
        status: bill.dues > 0 ? (bill.paid_amount > 0 ? 'partial' : 'unpaid') : 'paid'
      },

      // Metadata
      coupon_codes: bill.coupon_codes || [],
      referral_code: bill.referral_code
    }
  };
}

// POST /billing/{storeId}/bills - Save/finalize a bill
router.post('/billing/:storeId/bills', 
  authenticateToken, 
  generalLimiter, 
  validateParams(storeIdParamSchema), 
  validate(saveBillSchema), 
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { storeId } = req.params;
      const idempotencyKey = req.headers['idempotency-key'];
      
      // Check store access
      const userRole = await checkStoreAccess(storeId, userId);
      if (!userRole) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this store'
        });
      }
      
      // Check for existing bill with same idempotency key
      if (idempotencyKey) {
        const existing = await database.query(
          'SELECT * FROM bills WHERE idempotency_key = $1',
          [idempotencyKey]
        );
        if (existing.rows.length) {
          return res.status(409).json({
            success: false,
            message: 'Bill already exists with this idempotency key'
          });
        }
      }
      
      // Process bill in transaction
      const result = await withTransaction((client) => 
        billingService.saveBillTransaction(client, storeId, userId, req.body, idempotencyKey)
      );
      
      // Get complete bill details using the same format as GET endpoint
      const billDetails = await getBillDetails(result.bill.id, storeId);
      
      if (!billDetails) {
        return res.status(500).json({
          success: false,
          message: 'Bill created but could not retrieve details'
        });
      }
      
      res.status(201).json({
        success: true,
        message: 'Bill saved successfully',
        data: billDetails
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /billing/{storeId}/bills - List bills
router.get('/billing/:storeId/bills',
  authenticateToken,
  generalLimiter,
  validateParams(storeIdParamSchema),
  validateQuery(listBillsQuerySchema),
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { storeId } = req.params;
      
      // Parse and validate query parameters with defaults
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const { from, to, q, sort, status } = req.query;
      
      // Validate parsed values
      if (page < 1 || limit < 1 || limit > 100) {
        return res.status(400).json({
          success: false,
          message: 'Invalid pagination parameters'
        });
      }
      
      // Check store access
      const userRole = await checkStoreAccess(storeId, userId);
      if (!userRole) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this store'
        });
      }
      
      // Build query
      let whereConditions = ['b.store_id = $1'];
      let params = [storeId];
      let paramCount = 2;
      
      if (from) {
        whereConditions.push(`b.billing_timestamp >= $${paramCount}`);
        params.push(from);
        paramCount++;
      }
      
      if (to) {
        whereConditions.push(`b.billing_timestamp <= $${paramCount}`);
        params.push(to);
        paramCount++;
      }
      
      if (status) {
        whereConditions.push(`b.status = $${paramCount}`);
        params.push(status);
        paramCount++;
      }
      
      if (q) {
        whereConditions.push(`(
          c.name ILIKE $${paramCount} OR 
          c.phone_number ILIKE $${paramCount} OR 
          b.invoice_number ILIKE $${paramCount}
        )`);
        params.push(`%${q}%`);
        paramCount++;
      }
      
      const whereClause = whereConditions.join(' AND ');
      
      // Determine sort order
      let orderBy = 'b.billing_timestamp DESC';
      if (sort) {
        switch (sort) {
          case 'date_asc':
            orderBy = 'b.billing_timestamp ASC';
            break;
          case 'date_desc':
            orderBy = 'b.billing_timestamp DESC';
            break;
          case 'amount_asc':
            orderBy = 'b.grand_total ASC';
            break;
          case 'amount_desc':
            orderBy = 'b.grand_total DESC';
            break;
        }
      }
      
      // Get total count
      const countQuery = `
        SELECT COUNT(*) 
        FROM bills b 
        JOIN customers c ON b.customer_id = c.id 
        WHERE ${whereClause}
      `;
      const countResult = await database.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);
      
      // Get paginated results
      const offset = (page - 1) * limit;
      const listQuery = `
        SELECT 
          b.id as bill_id,
          b.invoice_number,
          b.created_at,
          c.name as customer_name,
          c.phone_number as customer_phone,
          b.grand_total,
          b.paid_amount as paid,
          b.dues,
          b.status
        FROM bills b
        JOIN customers c ON b.customer_id = c.id
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;
      params.push(limit, offset);
      
      const listResult = await database.query(listQuery, params);
      
      // Format bills with null safety for frontend compatibility
      const items = listResult.rows.map(bill => ({
        ...bill,
        customer_name: bill.customer_name || '',
        customer_phone: bill.customer_phone || '',
        grand_total: parseFloat(bill.grand_total || 0),
        paid: parseFloat(bill.paid || 0),
        dues: parseFloat(bill.dues || 0),
        status: bill.status || 'unpaid',
        customer: {
          name: bill.customer_name || '',
          phone_number: bill.customer_phone || ''
        }
      }));
      
      res.json({
        success: true,
        data: {
          items: items || [],
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total || 0)
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /billing/{storeId}/customers/{customerId}/bills - List bills for a specific customer
router.get('/billing/:storeId/customers/:customerId/bills',
  authenticateToken,
  generalLimiter,
  validateParams(customerIdParamSchema),
  validateQuery(customerBillsQuerySchema),
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { storeId, customerId } = req.params;
      
      // Parse and validate query parameters with defaults
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const { from, to, sort = 'date_desc', due_only } = req.query;
      
      // Validate parsed values
      if (page < 1 || limit < 1 || limit > 100) {
        return res.status(400).json({
          success: false,
          message: 'Invalid pagination parameters'
        });
      }
      
      // Check store access
      const userRole = await checkStoreAccess(storeId, userId);
      if (!userRole) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this store'
        });
      }
      
      // Verify customer exists and belongs to the store
      const customerCheck = await database.query(
        'SELECT id, name, phone_number FROM customers WHERE id = $1 AND store_id = $2',
        [customerId, storeId]
      );
      
      if (customerCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found in this store'
        });
      }
      
      const customer = customerCheck.rows[0];
      
      // Build query conditions
      let whereConditions = ['b.store_id = $1', 'b.customer_id = $2'];
      let params = [storeId, customerId];
      let paramCount = 3;
      
      if (from) {
        whereConditions.push(`b.billing_timestamp >= $${paramCount}`);
        params.push(from);
        paramCount++;
      }
      
      if (to) {
        whereConditions.push(`b.billing_timestamp <= $${paramCount}`);
        params.push(to);
        paramCount++;
      }
      
      if (due_only) {
        whereConditions.push('b.dues > 0');
      }
      
      const whereClause = whereConditions.join(' AND ');
      
      // Determine sort order
      let orderBy = 'b.billing_timestamp DESC';
      if (sort) {
        switch (sort) {
          case 'date_asc':
            orderBy = 'b.billing_timestamp ASC';
            break;
          case 'date_desc':
            orderBy = 'b.billing_timestamp DESC';
            break;
          case 'amount_asc':
            orderBy = 'b.grand_total ASC';
            break;
          case 'amount_desc':
            orderBy = 'b.grand_total DESC';
            break;
        }
      }
      
      // Get total count
      const countQuery = `
        SELECT COUNT(*) 
        FROM bills b 
        WHERE ${whereClause}
      `;
      const countResult = await database.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);
      
      // Get summary statistics for the customer
      const summaryQuery = `
        SELECT 
          COUNT(*) as total_bills,
          COALESCE(SUM(b.grand_total), 0) as total_billed,
          COALESCE(SUM(b.paid_amount), 0) as total_paid,
          COALESCE(SUM(b.dues), 0) as total_dues,
          COUNT(CASE WHEN b.dues > 0 THEN 1 END) as bills_with_dues
        FROM bills b 
        WHERE b.store_id = $1 AND b.customer_id = $2
      `;
      const summaryResult = await database.query(summaryQuery, [storeId, customerId]);
      const summary = summaryResult.rows[0];
      
      // Get paginated results with detailed bill information
      const offset = (page - 1) * limit;
      const listQuery = `
        SELECT 
          b.id as bill_id,
          b.invoice_number,
          b.billing_timestamp,
          b.payment_timestamp,
          b.created_at,
          b.sub_total,
          b.discount,
          b.tax_amount,
          b.cgst_amount,
          b.sgst_amount,
          b.grand_total,
          b.paid_amount as paid,
          b.dues,
          b.status,
          b.payment_mode,
          b.coupon_codes,
          b.referral_code
        FROM bills b
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;
      params.push(limit, offset);
      
      const listResult = await database.query(listQuery, params);
      
      // Format bills with enhanced status information and customer details
      const bills = listResult.rows.map(bill => ({
        ...bill,
        // Include customer information in each bill for frontend compatibility
        customer: {
          id: customer.id,
          name: customer.name || '',
          phone_number: customer.phone_number || ''
        },
        customer_name: customer.name || '',
        customer_phone: customer.phone_number || '',
        paid: parseFloat(bill.paid || 0),
        dues: parseFloat(bill.dues || 0),
        grand_total: parseFloat(bill.grand_total || 0),
        sub_total: parseFloat(bill.sub_total || 0),
        discount: parseFloat(bill.discount || 0),
        tax_amount: parseFloat(bill.tax_amount || 0),
        cgst_amount: parseFloat(bill.cgst_amount || 0),
        sgst_amount: parseFloat(bill.sgst_amount || 0),
        // Enhanced status with payment information
        payment_status: bill.dues > 0 ? (bill.paid > 0 ? 'partial' : 'unpaid') : 'paid',
        is_overdue: bill.dues > 0 && bill.payment_timestamp === null
      }));
      
      res.json({
        success: true,
        data: {
          customer: {
            id: customer.id || '',
            name: customer.name || '',
            phone_number: customer.phone_number || ''
          },
          summary: {
            total_bills: parseInt(summary.total_bills || 0),
            total_billed: parseFloat(summary.total_billed || 0),
            total_paid: parseFloat(summary.total_paid || 0),
            total_dues: parseFloat(summary.total_dues || 0),
            bills_with_dues: parseInt(summary.bills_with_dues || 0)
          },
          bills: bills || [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(total || 0),
            has_more: offset + bills.length < total
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /billing/{storeId}/bills/hold - Put bill on hold
router.post('/billing/:storeId/bills/hold',
  authenticateToken,
  generalLimiter,
  validateParams(storeIdParamSchema),
  validate(holdBillSchema),
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { storeId } = req.params;
      const idempotencyKey = req.headers['idempotency-key'];
      
      // Check store access
      const userRole = await checkStoreAccess(storeId, userId);
      if (!userRole) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this store'
        });
      }
      
      // Check for existing held bill with same idempotency key
      if (idempotencyKey) {
        const existing = await database.query(
          'SELECT * FROM held_bills WHERE idempotency_key = $1',
          [idempotencyKey]
        );
        if (existing.rows.length) {
          return res.status(409).json({
            success: false,
            message: 'Held bill already exists with this idempotency key'
          });
        }
      }
      
      // Process held bill in transaction
      const heldBill = await withTransaction((client) =>
        billingService.holdBillTransaction(client, storeId, userId, req.body, idempotencyKey)
      );
      
      res.status(201).json({
        success: true,
        message: 'Bill held successfully',
        data: {
          held_id: heldBill.id,
          created_at: heldBill.created_at
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /billing/{storeId}/bills/held - List held bills
router.get('/billing/:storeId/bills/held',
  authenticateToken,
  generalLimiter,
  validateParams(storeIdParamSchema),
  validateQuery(listHeldBillsQuerySchema),
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { storeId } = req.params;
      
      // Parse and validate pagination parameters with defaults
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      
      // Validate parsed values
      if (page < 1 || limit < 1 || limit > 100) {
        return res.status(400).json({
          success: false,
          message: 'Invalid pagination parameters'
        });
      }
      
      // Check store access
      const userRole = await checkStoreAccess(storeId, userId);
      if (!userRole) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this store'
        });
      }
      
      const offset = (page - 1) * limit;
      const result = await database.query(
        `SELECT id, created_at, customer_summary, amount_estimate
         FROM held_bills 
         WHERE store_id = $1 
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [storeId, limit, offset]
      );
      
      const heldBills = result.rows.map(row => ({
        held_id: row.id,
        created_at: row.created_at,
        customer_summary: row.customer_summary,
        amount_estimate: parseFloat(row.amount_estimate || 0)
      }));
      
      res.json({
        success: true,
        data: {
          held: heldBills
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /billing/{storeId}/bills/held/{heldId} - Get held bill by id
router.get('/billing/:storeId/bills/held/:heldId',
  authenticateToken,
  generalLimiter,
  validateParams(heldIdParamSchema),
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { storeId, heldId } = req.params;
      
      // Check store access
      const userRole = await checkStoreAccess(storeId, userId);
      if (!userRole) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this store'
        });
      }
      
      // Get held bill
      const result = await database.query(
        'SELECT * FROM held_bills WHERE id = $1 AND store_id = $2',
        [heldId, storeId]
      );
      
      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          message: 'Held bill not found'
        });
      }
      
      const heldBill = result.rows[0];
      
      // Get suggested invoice number
      const suggestedNumber = await withTransaction((client) =>
        billingService.getSuggestedInvoiceNumber(client, storeId)
      );
      
      res.json({
        success: true,
        data: {
          held: {
            payload: heldBill.payload,
            suggested_number: suggestedNumber
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /billing/{storeId}/bills/{billId} - Get bill by ID (Public API - No Auth Required)
router.get('/billing/:storeId/bills/:billId',
  generalLimiter,
  validateParams(billIdParamSchema),
  async (req, res, next) => {
    try {
      const { storeId, billId } = req.params;

      // Get complete bill details
      const billDetails = await getBillDetails(billId, storeId);
      
      if (!billDetails) {
        return res.status(404).json({
          success: false,
          message: 'Bill not found'
        });
      }

      res.json({
        success: true,
        data: billDetails
      });

    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;