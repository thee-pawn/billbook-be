const express = require('express');
const router = express.Router();
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');
const database = require('../config/database');

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

// Helper function to build customer response with memberships and packages
async function buildCustomerResponse(customer) {
  // Get customer memberships
  const memberships = await database.query(
    `SELECT 
      mc.id,
      mc.membership_id,
      m.name as membership_name,
      mc.purchased_date,
      mc.valid_from,
      mc.valid_till,
      mc.remaining_services,
      mc.remaining_products,
      mc.status
     FROM membership_customers mc
     JOIN memberships m ON mc.membership_id = m.id
     WHERE mc.customer_id = $1 AND mc.status = 'active'
     ORDER BY mc.purchased_date DESC`,
    [customer.id]
  );

  // Get customer service packages
  const servicePackages = await database.query(
    `SELECT 
      spc.id,
      spc.service_package_id,
      sp.package_name,
      spc.purchased_date,
      spc.valid_from,
      spc.valid_till,
      spc.remaining_services,
      spc.status
     FROM service_packages_customers spc
     JOIN service_packages sp ON spc.service_package_id = sp.id
     WHERE spc.customer_id = $1 AND spc.status = 'active'
     ORDER BY spc.purchased_date DESC`,
    [customer.id]
  );

  return {
    id: customer.id,
    phoneNumber: customer.phone_number,
    name: customer.name,
    gender: customer.gender,
    anniversary: customer.anniversary,
    birthday: customer.birthday,
    address: customer.address,
    loyaltyPoints: customer.loyalty_points,
    walletBalance: parseFloat(customer.wallet_balance),
    dues: parseFloat(customer.dues),
    advanceAmount: parseFloat(customer.advance_amount),
    lastVisit: customer.last_visit,
    referralCode: customer.referral_code,
    status: customer.status,
    memberships: memberships.rows.map(membership => ({
      id: membership.id,
      membershipId: membership.membership_id,
      membershipName: membership.membership_name,
      purchasedDate: membership.purchased_date,
      validFrom: membership.valid_from,
      validTill: membership.valid_till,
      remainingServices: membership.remaining_services,
      remainingProducts: membership.remaining_products,
      status: membership.status
    })),
    servicePackages: servicePackages.rows.map(pkg => ({
      id: pkg.id,
      servicePackageId: pkg.service_package_id,
      packageName: pkg.package_name,
      purchasedDate: pkg.purchased_date,
      validFrom: pkg.valid_from,
      validTill: pkg.valid_till,
      remainingServices: pkg.remaining_services,
      status: pkg.status
    })),
    created_at: customer.created_at,
    updated_at: customer.updated_at
  };
}

// Get all customers for a store
router.get('/:storeId', authenticateToken, generalLimiter, validateQuery(schemas.customerQuery), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      search, 
      gender,
      status,
      hasLoyaltyPoints,
      hasDues,
      hasWalletBalance,
      sortBy = 'created_at', 
      sortOrder = 'desc' 
    } = req.query;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Build the base query
    let baseQuery = 'FROM customers WHERE store_id = $1';
    let queryParams = [storeId];
    let paramCount = 2;

    // Add search filter (name or phone)
    if (search) {
      baseQuery += ` AND (name ILIKE $${paramCount} OR phone_number ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    // Add gender filter
    if (gender) {
      baseQuery += ` AND gender = $${paramCount}`;
      queryParams.push(gender);
      paramCount++;
    }

    // Add status filter
    if (status) {
      baseQuery += ` AND status = $${paramCount}`;
      queryParams.push(status);
      paramCount++;
    }

    // Add loyalty points filter
    if (hasLoyaltyPoints !== undefined) {
      if (hasLoyaltyPoints === true || hasLoyaltyPoints === 'true') {
        baseQuery += ` AND loyalty_points > 0`;
      } else {
        baseQuery += ` AND loyalty_points = 0`;
      }
    }

    // Add dues filter
    if (hasDues !== undefined) {
      if (hasDues === true || hasDues === 'true') {
        baseQuery += ` AND dues > 0`;
      } else {
        baseQuery += ` AND dues = 0`;
      }
    }

    // Add wallet balance filter
    if (hasWalletBalance !== undefined) {
      if (hasWalletBalance === true || hasWalletBalance === 'true') {
        baseQuery += ` AND wallet_balance > 0`;
      } else {
        baseQuery += ` AND wallet_balance = 0`;
      }
    }

    // Get total count
    const countResult = await database.query(`SELECT COUNT(*) ${baseQuery}`, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Build the main query with sorting and pagination
    const offset = (page - 1) * limit;
    const validSortColumns = ['name', 'phone_number', 'loyalty_points', 'wallet_balance', 'last_visit', 'created_at'];
    const dbColumnMap = {
      'phoneNumber': 'phone_number',
      'loyaltyPoints': 'loyalty_points',
      'walletBalance': 'wallet_balance',
      'lastVisit': 'last_visit'
    };
    const sortColumn = dbColumnMap[sortBy] || (validSortColumns.includes(sortBy) ? sortBy : 'created_at');
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const customersQuery = `
      SELECT * ${baseQuery}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    queryParams.push(limit, offset);

    const result = await database.query(customersQuery, queryParams);

    // Build response with memberships and packages for each customer
    const customersWithDetails = [];
    for (const customer of result.rows) {
      const customerData = await buildCustomerResponse(customer);
      customersWithDetails.push(customerData);
    }

    res.json({
      success: true,
      message: 'Customers retrieved successfully',
      data: {
        customers: customersWithDetails,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get a single customer with all details
// Get customer by phone number (must be before :customerId route to avoid conflict)
router.get('/:storeId/by-phone/:phoneNumber', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, phoneNumber } = req.params;

    // Simple normalization: trim and remove spaces
    const normalizedPhone = phoneNumber.trim();
    // if (!/^\d{6,15}$/.test(normalizedPhone)) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Invalid phone number format'
    //   });
    // }

    // Access check
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    const customerResult = await database.query(
      'SELECT * FROM customers WHERE store_id = $1 AND phone_number = $2',
      [storeId, normalizedPhone]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const customerData = await buildCustomerResponse(customerResult.rows[0]);
    res.json({
      success: true,
      message: 'Customer retrieved successfully',
      data: { customer: customerData }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:storeId/:customerId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, customerId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Get customer details
    const customerResult = await database.query(
      'SELECT * FROM customers WHERE id = $1 AND store_id = $2',
      [customerId, storeId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const customer = customerResult.rows[0];
    const customerData = await buildCustomerResponse(customer);

    res.json({
      success: true,
      message: 'Customer retrieved successfully',
      data: {
        customer: customerData
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create a new customer
router.post('/:storeId', authenticateToken, generalLimiter, validate(schemas.createCustomer), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const {
      phoneNumber, name = '', gender = '', birthday = '', anniversary = '', address = ''
    } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to create customers (all roles can create)
    if (!['owner', 'manager', 'employee'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create customers for this store'
      });
    }

    // Create customer
    const result = await database.query(
      `INSERT INTO customers (
        store_id, phone_number, name, gender, birthday, anniversary, address,
        loyalty_points, wallet_balance, dues, advance_amount, last_visit,
        status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 0, 0.00, 0.00, 0.00, NOW(), 'active', NOW(), NOW()
      ) RETURNING *`,
      [storeId, phoneNumber, name, gender, birthday, anniversary, address]
    );

    const createdCustomer = result.rows[0];
    const customerData = await buildCustomerResponse(createdCustomer);

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: {
        customer: customerData
      }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Phone number already exists for this store'
      });
    }
    next(error);
  }
});

// Create a note for a customer
router.post('/:storeId/:customerId/notes', authenticateToken, generalLimiter, validate(schemas.createCustomerNote), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, customerId } = req.params;
    const { note, starred = false } = req.body;

    // Access check
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({ success: false, message: 'You do not have access to this store' });
    }

    // Ensure customer belongs to the store
    const cust = await database.query('SELECT id FROM customers WHERE id = $1 AND store_id = $2', [customerId, storeId]);
    if (cust.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const result = await database.query(
      `INSERT INTO customer_notes (customer_id, notes, starred, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *`,
      [customerId, note, starred]
    );

    res.status(201).json({
      success: true,
      message: 'Customer note created successfully',
      data: { note: mapCustomerNote(result.rows[0]) }
    });
  } catch (error) {
    next(error);
  }
});

// Update a customer note
router.put('/:storeId/:customerId/notes/:noteId', authenticateToken, generalLimiter, validate(schemas.updateCustomerNote), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, customerId, noteId } = req.params;
    const { note, starred } = req.body;

    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({ success: false, message: 'You do not have access to this store' });
    }

    // Validate customer and note relationship
    const noteRes = await database.query(
      `SELECT cn.* FROM customer_notes cn
       JOIN customers c ON c.id = cn.customer_id
       WHERE cn.id = $1 AND cn.customer_id = $2 AND c.store_id = $3`,
      [noteId, customerId, storeId]
    );
    if (noteRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Note not found for this customer' });
    }

    const fields = [];
    const values = [];
    let idx = 1;
    if (note !== undefined) { fields.push(`notes = $${idx++}`); values.push(note); }
    if (starred !== undefined) { fields.push(`starred = $${idx++}`); values.push(starred); }
    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    fields.push('updated_at = NOW()');
    values.push(noteId);

    const updateSql = `UPDATE customer_notes SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const updated = await database.query(updateSql, values);

    res.json({
      success: true,
      message: 'Customer note updated successfully',
      data: { note: mapCustomerNote(updated.rows[0]) }
    });
  } catch (error) {
    next(error);
  }
});

// Get all notes for a customer
router.get('/:storeId/:customerId/notes', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, customerId } = req.params;

    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({ success: false, message: 'You do not have access to this store' });
    }

    const cust = await database.query('SELECT id FROM customers WHERE id = $1 AND store_id = $2', [customerId, storeId]);
    if (cust.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const notesRes = await database.query(
      `SELECT * FROM customer_notes WHERE customer_id = $1 ORDER BY starred DESC, created_at DESC`,
      [customerId]
    );

    res.json({
      success: true,
      message: 'Customer notes retrieved successfully',
      data: { notes: notesRes.rows.map(mapCustomerNote) }
    });
  } catch (error) {
    next(error);
  }
});

// Delete a note by id
router.delete('/:storeId/:customerId/notes/:noteId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, customerId, noteId } = req.params;

    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({ success: false, message: 'You do not have access to this store' });
    }

    // Ensure note belongs to customer and store
    const noteRes = await database.query(
      `SELECT cn.id FROM customer_notes cn
       JOIN customers c ON c.id = cn.customer_id
       WHERE cn.id = $1 AND cn.customer_id = $2 AND c.store_id = $3`,
      [noteId, customerId, storeId]
    );
    if (noteRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Note not found for this customer' });
    }

    await database.query('DELETE FROM customer_notes WHERE id = $1', [noteId]);

    res.json({ success: true, message: 'Customer note deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Helper to map DB note row to API shape
function mapCustomerNote(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    note: row.notes,
    starred: row.starred,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// Update customer
router.put('/:storeId/:customerId', authenticateToken, generalLimiter, validate(schemas.updateCustomer), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, customerId } = req.params;
    const {
      phoneNumber, name, gender, birthday, anniversary, address
    } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to update customers
    if (!['owner', 'manager', 'employee'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update customers for this store'
      });
    }

    // Check if customer exists
    const existingCustomer = await database.query(
      'SELECT * FROM customers WHERE id = $1 AND store_id = $2',
      [customerId, storeId]
    );

    if (existingCustomer.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Build update query dynamically
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (phoneNumber !== undefined) {
      updateFields.push(`phone_number = $${paramCount++}`);
      values.push(phoneNumber);
    }
    if (name !== undefined) {
      updateFields.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (gender !== undefined) {
      updateFields.push(`gender = $${paramCount++}`);
      values.push(gender);
    }
    if (birthday !== undefined) {
      updateFields.push(`birthday = $${paramCount++}`);
      values.push(birthday);
    }
    if (anniversary !== undefined) {
      updateFields.push(`anniversary = $${paramCount++}`);
      values.push(anniversary);
    }
    if (address !== undefined) {
      updateFields.push(`address = $${paramCount++}`);
      values.push(address);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided for update'
      });
    }

    // Add updated_at and customer id and store id
    updateFields.push(`updated_at = NOW()`);
    values.push(customerId, storeId);

    const updateQuery = `
      UPDATE customers 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount++} AND store_id = $${paramCount++}
      RETURNING *
    `;

    const result = await database.query(updateQuery, values);
    const updatedCustomer = result.rows[0];
    const customerData = await buildCustomerResponse(updatedCustomer);

    res.json({
      success: true,
      message: 'Customer updated successfully',
      data: {
        customer: customerData
      }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Phone number already exists for this store'
      });
    }
    next(error);
  }
});

// Delete customer
router.delete('/:storeId/:customerId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, customerId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to delete customers (only owner and manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete customers for this store'
      });
    }

    // Check if customer exists
    const existingCustomer = await database.query(
      'SELECT * FROM customers WHERE id = $1 AND store_id = $2',
      [customerId, storeId]
    );

    if (existingCustomer.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Soft delete the customer (update status to inactive)
    await database.query(
      'UPDATE customers SET status = $1, updated_at = NOW() WHERE id = $2 AND store_id = $3',
      ['inactive', customerId, storeId]
    );

    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Adjust customer loyalty points or wallet balance
router.patch('/:storeId/:customerId/adjustment', authenticateToken, generalLimiter, validate(schemas.customerAdjustment), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, customerId } = req.params;
    const {
      type, amount, operation, reason = ''
    } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to make adjustments
    if (!['owner', 'manager', 'employee'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to make customer adjustments for this store'
      });
    }

    // Check if customer exists
    const existingCustomer = await database.query(
      'SELECT * FROM customers WHERE id = $1 AND store_id = $2',
      [customerId, storeId]
    );

    if (existingCustomer.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const customer = existingCustomer.rows[0];

    await database.transaction(async (client) => {
      if (type === 'loyalty') {
        // Adjust loyalty points
        const newLoyaltyPoints = operation === 'add' 
          ? parseInt(customer.loyalty_points) + parseInt(amount)
          : parseInt(customer.loyalty_points) - parseInt(amount);

        if (newLoyaltyPoints < 0) {
          throw new Error('Insufficient loyalty points for this operation');
        }

        // Update customer loyalty points
        await client.query(
          'UPDATE customers SET loyalty_points = $1, updated_at = NOW() WHERE id = $2',
          [newLoyaltyPoints, customerId]
        );

        // Record in loyalty history
        await client.query(
          `INSERT INTO customer_loyalty_history (
            customer_id, operation, points, balance_after, reason, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())`,
          [customerId, operation, amount, newLoyaltyPoints, reason]
        );
      } else if (type === 'wallet') {
        // Adjust wallet balance
        const newWalletBalance = operation === 'add' 
          ? parseFloat(customer.wallet_balance) + parseFloat(amount)
          : parseFloat(customer.wallet_balance) - parseFloat(amount);

        if (newWalletBalance < 0) {
          throw new Error('Insufficient wallet balance for this operation');
        }

        // Update customer wallet balance
        await client.query(
          'UPDATE customers SET wallet_balance = $1, updated_at = NOW() WHERE id = $2',
          [newWalletBalance.toFixed(2), customerId]
        );

        // Record in wallet history
        await client.query(
          `INSERT INTO customer_wallet_history (
            customer_id, operation, amount, balance_after, reason, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())`,
          [customerId, operation, amount, newWalletBalance.toFixed(2), reason]
        );
      } else if (type === 'dues') {
        // Adjust dues
        const newDues = operation === 'add' 
          ? parseFloat(customer.dues) + parseFloat(amount)
          : parseFloat(customer.dues) - parseFloat(amount);

        if (newDues < 0) {
          throw new Error('Dues cannot be negative');
        }

        // Update customer dues
        await client.query(
          'UPDATE customers SET dues = $1, updated_at = NOW() WHERE id = $2',
          [newDues.toFixed(2), customerId]
        );
      } else if (type === 'advance') {
        // Adjust advance amount
        const newAdvanceAmount = operation === 'add' 
          ? parseFloat(customer.advance_amount) + parseFloat(amount)
          : parseFloat(customer.advance_amount) - parseFloat(amount);

        if (newAdvanceAmount < 0) {
          throw new Error('Advance amount cannot be negative');
        }

        // Update customer advance amount
        await client.query(
          'UPDATE customers SET advance_amount = $1, updated_at = NOW() WHERE id = $2',
          [newAdvanceAmount.toFixed(2), customerId]
        );
      }
    });

    // Get updated customer data
    const updatedCustomerResult = await database.query(
      'SELECT * FROM customers WHERE id = $1 AND store_id = $2',
      [customerId, storeId]
    );

    const updatedCustomer = updatedCustomerResult.rows[0];
    const customerData = await buildCustomerResponse(updatedCustomer);

    res.json({
      success: true,
      message: `Customer ${type} ${operation === 'add' ? 'added' : 'deducted'} successfully`,
      data: {
        customer: customerData
      }
    });
  } catch (error) {
    next(error);
  }
});

// Purchase membership for customer
router.post('/:storeId/:customerId/memberships', authenticateToken, generalLimiter, validate(schemas.purchaseMembership), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, customerId } = req.params;
    const {
      membershipId, validFrom, validTill, paymentMethod = 'cash'
    } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission
    if (!['owner', 'manager', 'employee'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to process membership purchases for this store'
      });
    }

    // Check if customer exists
    const customerResult = await database.query(
      'SELECT * FROM customers WHERE id = $1 AND store_id = $2',
      [customerId, storeId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check if membership exists and belongs to this store
    const membershipResult = await database.query(
      'SELECT * FROM memberships WHERE id = $1 AND store_id = $2 AND status = $3',
      [membershipId, storeId, 'active']
    );

    if (membershipResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Membership not found or inactive'
      });
    }

    const membership = membershipResult.rows[0];

    await database.transaction(async (client) => {
      // Create membership purchase record
      const membershipCustomerResult = await client.query(
        `INSERT INTO membership_customers (
          membership_id, customer_id, purchased_date, valid_from, valid_till,
          remaining_services, remaining_products, status, created_at, updated_at
        ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, 'active', NOW(), NOW())
        RETURNING *`,
        [
          membershipId, customerId, validFrom, validTill,
          membership.included_services || {}, membership.included_products || {}
        ]
      );

      // Update customer last visit
      await client.query(
        'UPDATE customers SET last_visit = NOW(), updated_at = NOW() WHERE id = $1',
        [customerId]
      );
    });

    // Get updated customer data
    const updatedCustomerResult = await database.query(
      'SELECT * FROM customers WHERE id = $1 AND store_id = $2',
      [customerId, storeId]
    );

    const updatedCustomer = updatedCustomerResult.rows[0];
    const customerData = await buildCustomerResponse(updatedCustomer);

    res.status(201).json({
      success: true,
      message: 'Membership purchased successfully',
      data: {
        customer: customerData
      }
    });
  } catch (error) {
    next(error);
  }
});

// Purchase service package for customer
router.post('/:storeId/:customerId/service-packages', authenticateToken, generalLimiter, validate(schemas.purchaseServicePackage), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, customerId } = req.params;
    const {
      servicePackageId, validFrom, validTill, paymentMethod = 'cash'
    } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission
    if (!['owner', 'manager', 'employee'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to process service package purchases for this store'
      });
    }

    // Check if customer exists
    const customerResult = await database.query(
      'SELECT * FROM customers WHERE id = $1 AND store_id = $2',
      [customerId, storeId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check if service package exists and belongs to this store
    const packageResult = await database.query(
      'SELECT * FROM service_packages WHERE id = $1 AND store_id = $2 AND status = $3',
      [servicePackageId, storeId, 'active']
    );

    if (packageResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service package not found or inactive'
      });
    }

    const servicePackage = packageResult.rows[0];

    await database.transaction(async (client) => {
      // Create service package purchase record
      const packageCustomerResult = await client.query(
        `INSERT INTO service_packages_customers (
          service_package_id, customer_id, purchased_date, valid_from, valid_till,
          remaining_services, status, created_at, updated_at
        ) VALUES ($1, $2, NOW(), $3, $4, $5, 'active', NOW(), NOW())
        RETURNING *`,
        [
          servicePackageId, customerId, validFrom, validTill,
          servicePackage.included_services || {}
        ]
      );

      // Update customer last visit
      await client.query(
        'UPDATE customers SET last_visit = NOW(), updated_at = NOW() WHERE id = $1',
        [customerId]
      );
    });

    // Get updated customer data
    const updatedCustomerResult = await database.query(
      'SELECT * FROM customers WHERE id = $1 AND store_id = $2',
      [customerId, storeId]
    );

    const updatedCustomer = updatedCustomerResult.rows[0];
    const customerData = await buildCustomerResponse(updatedCustomer);

    res.status(201).json({
      success: true,
      message: 'Service package purchased successfully',
      data: {
        customer: customerData
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
