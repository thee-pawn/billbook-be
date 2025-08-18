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

// Get all services for a store
router.get('/:storeId', authenticateToken, generalLimiter, validateQuery(schemas.serviceQuery), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      search, 
      category, 
      gender,
      status,
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
    let baseQuery = 'FROM services WHERE store_id = $1';
    let queryParams = [storeId];
    let paramCount = 2;

    // Add search filter
    if (search) {
      baseQuery += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    // Add category filter
    if (category) {
      baseQuery += ` AND category = $${paramCount}`;
      queryParams.push(category);
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

    // Get total count
    const countResult = await database.query(`SELECT COUNT(*) ${baseQuery}`, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Build the main query with sorting and pagination
    const offset = (page - 1) * limit;
    const validSortColumns = ['name', 'category', 'gender', 'price', 'duration', 'status', 'created_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const servicesQuery = `
      SELECT * ${baseQuery}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    queryParams.push(limit, offset);

    const result = await database.query(servicesQuery, queryParams);

    res.json({
      success: true,
      message: 'Services retrieved successfully',
      data: {
        services: result.rows,
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

// Get a single service with product usage
router.get('/:storeId/:serviceId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, serviceId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Get service details
    const serviceResult = await database.query(
      'SELECT * FROM services WHERE id = $1 AND store_id = $2',
      [serviceId, storeId]
    );

    if (serviceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    const service = serviceResult.rows[0];

    // Get product usage for this service
    const productUsageResult = await database.query(
      `SELECT spu.id, spu.qty, spu.unit, p.id as product_id, p.name as product_name
       FROM service_product_usage spu
       JOIN products p ON spu.product_id = p.id
       WHERE spu.service_id = $1`,
      [serviceId]
    );

    const productUsage = productUsageResult.rows.map(row => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      qty: row.qty,
      unit: row.unit
    }));

    res.json({
      success: true,
      message: 'Service retrieved successfully',
      data: {
        service: {
          ...service,
          productUsage
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create a new service
router.post('/:storeId', authenticateToken, generalLimiter, validate(schemas.createService), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const {
      name, reminder, category, description, gender, price, duration, tax_prcnt, status = 'active', productUsage = []
    } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage services (owner, manager, or staff)
    if (!['owner', 'manager', 'staff'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create services for this store'
      });
    }

    // Validate that all products exist and belong to the same store
    if (productUsage.length > 0) {
      const productIds = productUsage.map(p => p.productId);
      const productCheck = await database.query(
        `SELECT id FROM products WHERE id = ANY($1) AND store_id = $2`,
        [productIds, storeId]
      );

      if (productCheck.rows.length !== productIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more products not found or do not belong to this store'
        });
      }
    }

    // Start transaction
    await database.query('BEGIN');

    try {
      // Create service
      const serviceResult = await database.query(
        `INSERT INTO services (
          store_id, name, reminder, category, description, gender, price, 
          duration, tax_prcnt, status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
        ) RETURNING *`,
        [storeId, name, reminder, category, description, gender, price, duration, tax_prcnt, status]
      );

      const service = serviceResult.rows[0];

      // Create product usage entries
      const createdProductUsage = [];
      for (const usage of productUsage) {
        const usageResult = await database.query(
          `INSERT INTO service_product_usage (service_id, product_id, qty, unit, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           RETURNING *`,
          [service.id, usage.productId, usage.qty, usage.unit]
        );
        
        // Get product name for response
        const productResult = await database.query(
          'SELECT name FROM products WHERE id = $1',
          [usage.productId]
        );

        createdProductUsage.push({
          id: usageResult.rows[0].id,
          productId: usage.productId,
          productName: productResult.rows[0].name,
          qty: usage.qty,
          unit: usage.unit
        });
      }

      // Commit transaction
      await database.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Service created successfully',
        data: {
          service: {
            ...service,
            productUsage: createdProductUsage
          }
        }
      });
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Update a service
router.put('/:storeId/:serviceId', authenticateToken, generalLimiter, validate(schemas.updateService), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, serviceId } = req.params;
    const updateFields = req.body;
    const { productUsage } = updateFields;

    // Remove productUsage from updateFields for service update
    delete updateFields.productUsage;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage services (owner, manager, or staff)
    if (!['owner', 'manager', 'staff'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update services for this store'
      });
    }

    // Check if service exists
    const existingService = await database.query(
      'SELECT id FROM services WHERE id = $1 AND store_id = $2',
      [serviceId, storeId]
    );

    if (existingService.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Validate products if productUsage is provided
    if (productUsage && productUsage.length > 0) {
      const productIds = productUsage.map(p => p.productId);
      const productCheck = await database.query(
        `SELECT id FROM products WHERE id = ANY($1) AND store_id = $2`,
        [productIds, storeId]
      );

      if (productCheck.rows.length !== productIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more products not found or do not belong to this store'
        });
      }
    }

    // Start transaction
    await database.query('BEGIN');

    try {
      let updatedService;

      // Update service if there are fields to update
      if (Object.keys(updateFields).length > 0) {
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

        updateFieldsArray.push(`updated_at = NOW()`);
        updateValues.push(serviceId, storeId);

        const updateQuery = `
          UPDATE services 
          SET ${updateFieldsArray.join(', ')}
          WHERE id = $${paramCount} AND store_id = $${paramCount + 1}
          RETURNING *
        `;

        const result = await database.query(updateQuery, updateValues);
        updatedService = result.rows[0];
      } else {
        // Get current service if no service fields to update
        const result = await database.query(
          'SELECT * FROM services WHERE id = $1 AND store_id = $2',
          [serviceId, storeId]
        );
        updatedService = result.rows[0];
      }

      // Update product usage if provided
      let updatedProductUsage = [];
      if (productUsage !== undefined) {
        // Delete existing product usage
        await database.query(
          'DELETE FROM service_product_usage WHERE service_id = $1',
          [serviceId]
        );

        // Create new product usage entries
        for (const usage of productUsage) {
          const usageResult = await database.query(
            `INSERT INTO service_product_usage (service_id, product_id, qty, unit, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())
             RETURNING *`,
            [serviceId, usage.productId, usage.qty, usage.unit]
          );
          
          // Get product name for response
          const productResult = await database.query(
            'SELECT name FROM products WHERE id = $1',
            [usage.productId]
          );

          updatedProductUsage.push({
            id: usageResult.rows[0].id,
            productId: usage.productId,
            productName: productResult.rows[0].name,
            qty: usage.qty,
            unit: usage.unit
          });
        }
      } else {
        // Get existing product usage if not updating
        const productUsageResult = await database.query(
          `SELECT spu.id, spu.qty, spu.unit, p.id as product_id, p.name as product_name
           FROM service_product_usage spu
           JOIN products p ON spu.product_id = p.id
           WHERE spu.service_id = $1`,
          [serviceId]
        );

        updatedProductUsage = productUsageResult.rows.map(row => ({
          id: row.id,
          productId: row.product_id,
          productName: row.product_name,
          qty: row.qty,
          unit: row.unit
        }));
      }

      // Commit transaction
      await database.query('COMMIT');

      res.json({
        success: true,
        message: 'Service updated successfully',
        data: {
          service: {
            ...updatedService,
            productUsage: updatedProductUsage
          }
        }
      });
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Delete a service
router.delete('/:storeId/:serviceId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, serviceId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to delete services (owner or manager only)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete services for this store'
      });
    }

    // Check if service exists
    const existingService = await database.query(
      'SELECT id, name FROM services WHERE id = $1 AND store_id = $2',
      [serviceId, storeId]
    );

    if (existingService.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Start transaction
    await database.query('BEGIN');

    try {
      // Delete product usage (will be handled by CASCADE, but being explicit)
      await database.query(
        'DELETE FROM service_product_usage WHERE service_id = $1',
        [serviceId]
      );

      // Delete the service
      await database.query(
        'DELETE FROM services WHERE id = $1 AND store_id = $2',
        [serviceId, storeId]
      );

      // Commit transaction
      await database.query('COMMIT');

      res.json({
        success: true,
        message: 'Service deleted successfully',
        data: {
          deleted_service: {
            id: serviceId,
            name: existingService.rows[0].name
          }
        }
      });
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
