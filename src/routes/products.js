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

// Get all products for a store
router.get('/:storeId', authenticateToken, generalLimiter, validateQuery(schemas.productQuery), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      search, 
      category, 
      company, 
      batch_no, 
      low_stock, 
      expiring_soon,
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
    let baseQuery = 'FROM products WHERE store_id = $1';
    let queryParams = [storeId];
    let paramCount = 2;

    // Add search filter
    if (search) {
      baseQuery += ` AND (name ILIKE $${paramCount} OR company ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    // Add category filter
    if (category) {
      baseQuery += ` AND category = $${paramCount}`;
      queryParams.push(category);
      paramCount++;
    }

    // Add company filter
    if (company) {
      baseQuery += ` AND company = $${paramCount}`;
      queryParams.push(company);
      paramCount++;
    }

    // Add batch number filter
    if (batch_no) {
      baseQuery += ` AND batch_no = $${paramCount}`;
      queryParams.push(batch_no);
      paramCount++;
    }

    // Add low stock filter
    if (low_stock === 'true') {
      baseQuery += ` AND qty <= notification_qty`;
    }

    // Add expiring soon filter
    if (expiring_soon === 'true') {
      baseQuery += ` AND exp_date <= (CURRENT_DATE + INTERVAL '1 day' * expiry_notification_days)`;
    }

    // Get total count
    const countResult = await database.query(`SELECT COUNT(*) ${baseQuery}`, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Build the main query with sorting and pagination
    const offset = (page - 1) * limit;
    const validSortColumns = ['name', 'category', 'company', 'exp_date', 'qty', 'created_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const productsQuery = `
      SELECT * ${baseQuery}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    queryParams.push(limit, offset);

    const result = await database.query(productsQuery, queryParams);

    res.json({
      success: true,
      message: 'Products retrieved successfully',
      data: {
        products: result.rows,
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

// Get a single product
router.get('/:storeId/:productId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, productId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    const result = await database.query(
      'SELECT * FROM products WHERE id = $1 AND store_id = $2',
      [productId, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product retrieved successfully',
      data: {
        product: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create a new product
router.post('/:storeId', authenticateToken, generalLimiter, validate(schemas.createProduct), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const {
      name, company, cost_price, selling_price, usage, category, qty = 0,
      prod_qty, prod_qty_unit, mfg_date, exp_date, notification_qty = 0,
      expiry_notification_days = 30, hsn_sac_code, tax_prcnt, description, batch_no
    } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage products (owner, manager, or staff)
    if (!['owner', 'manager', 'staff'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create products for this store'
      });
    }

    const result = await database.query(
      `INSERT INTO products (
        store_id, name, company, cost_price, selling_price, usage, category, qty,
        prod_qty, prod_qty_unit, mfg_date, exp_date, notification_qty,
        expiry_notification_days, hsn_sac_code, tax_prcnt, description, batch_no,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW()
      ) RETURNING *`,
      [
        storeId, name, company, cost_price, selling_price, usage, category, qty,
        prod_qty, prod_qty_unit, mfg_date, exp_date, notification_qty,
        expiry_notification_days, hsn_sac_code, tax_prcnt, description, batch_no
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: {
        product: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update a product
router.put('/:storeId/:productId', authenticateToken, generalLimiter, validate(schemas.updateProduct), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, productId } = req.params;
    const updateFields = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage products (owner, manager, or staff)
    if (!['owner', 'manager', 'staff'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update products for this store'
      });
    }

    // Check if product exists
    const existingProduct = await database.query(
      'SELECT id FROM products WHERE id = $1 AND store_id = $2',
      [productId, storeId]
    );

    if (existingProduct.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Build dynamic update query
    const updateFieldsArray = [];
    const updateValues = [];
    let paramCount = 1;

    Object.keys(updateFields).forEach(field => {
      if (updateFields[field] !== undefined) {
        updateFieldsArray.push(`${field} = $${paramCount}`);
        updateValues.push(updateFields[field]);
        paramCount++;
      }
    });

    // Add updated_at timestamp
    updateFieldsArray.push(`updated_at = NOW()`);
    updateValues.push(productId, storeId);

    const updateQuery = `
      UPDATE products 
      SET ${updateFieldsArray.join(', ')}
      WHERE id = $${paramCount} AND store_id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await database.query(updateQuery, updateValues);

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: {
        product: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// Decrease product quantity
router.patch('/:storeId/:productId/decrease-quantity', authenticateToken, generalLimiter, validate(schemas.quantityUpdate), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, productId } = req.params;
    const { quantity } = req.body;

    // Validate quantity
    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive number'
      });
    }

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage products
    if (!['owner', 'manager', 'staff'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update product quantities for this store'
      });
    }

    // Check if product exists and get current quantity
    const existingProduct = await database.query(
      'SELECT id, name, qty FROM products WHERE id = $1 AND store_id = $2',
      [productId, storeId]
    );

    if (existingProduct.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const currentQty = existingProduct.rows[0].qty;
    const newQty = Math.max(0, currentQty - quantity); // Ensure quantity doesn't go below 0

    // Update the quantity
    const result = await database.query(
      `UPDATE products 
       SET qty = $1, updated_at = NOW()
       WHERE id = $2 AND store_id = $3
       RETURNING *`,
      [newQty, productId, storeId]
    );

    res.json({
      success: true,
      message: 'Product quantity decreased successfully',
      data: {
        product: result.rows[0],
        previous_quantity: currentQty,
        decreased_by: quantity,
        new_quantity: newQty
      }
    });
  } catch (error) {
    next(error);
  }
});

// Increase product quantity
router.patch('/:storeId/:productId/increase-quantity', authenticateToken, generalLimiter, validate(schemas.quantityUpdate), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, productId } = req.params;
    const { quantity } = req.body;

    // Validate quantity
    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive number'
      });
    }

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage products
    if (!['owner', 'manager', 'staff'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update product quantities for this store'
      });
    }

    // Check if product exists and get current quantity
    const existingProduct = await database.query(
      'SELECT id, name, qty FROM products WHERE id = $1 AND store_id = $2',
      [productId, storeId]
    );

    if (existingProduct.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const currentQty = existingProduct.rows[0].qty;
    const newQty = currentQty + quantity;

    // Update the quantity
    const result = await database.query(
      `UPDATE products 
       SET qty = $1, updated_at = NOW()
       WHERE id = $2 AND store_id = $3
       RETURNING *`,
      [newQty, productId, storeId]
    );

    res.json({
      success: true,
      message: 'Product quantity increased successfully',
      data: {
        product: result.rows[0],
        previous_quantity: currentQty,
        increased_by: quantity,
        new_quantity: newQty
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete a product
router.delete('/:storeId/:productId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, productId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to delete products (owner or manager only)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete products for this store'
      });
    }

    // Check if product exists
    const existingProduct = await database.query(
      'SELECT id, name FROM products WHERE id = $1 AND store_id = $2',
      [productId, storeId]
    );

    if (existingProduct.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Delete the product
    await database.query(
      'DELETE FROM products WHERE id = $1 AND store_id = $2',
      [productId, storeId]
    );

    res.json({
      success: true,
      message: 'Product deleted successfully',
      data: {
        deleted_product: {
          id: productId,
          name: existingProduct.rows[0].name
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
