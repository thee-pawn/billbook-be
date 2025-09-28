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

// Get all service packages for a store
router.get('/:storeId', authenticateToken, generalLimiter, validateQuery(schemas.servicePackageQuery), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status,
      min_price,
      max_price,
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
    let baseQuery = 'FROM service_packages WHERE store_id = $1';
    let queryParams = [storeId];
    let paramCount = 2;

    // Add search filter
    if (search) {
      baseQuery += ` AND (package_name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    // Add status filter
    if (status) {
      baseQuery += ` AND status = $${paramCount}`;
      queryParams.push(status);
      paramCount++;
    }

    // Add price range filters
    if (min_price) {
      baseQuery += ` AND price >= $${paramCount}`;
      queryParams.push(min_price);
      paramCount++;
    }

    if (max_price) {
      baseQuery += ` AND price <= $${paramCount}`;
      queryParams.push(max_price);
      paramCount++;
    }

    // Get total count
    const countResult = await database.query(`SELECT COUNT(*) ${baseQuery}`, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Build the main query with sorting and pagination
    const offset = (page - 1) * limit;
    const validSortColumns = ['package_name', 'price', 'created_at', 'status'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const packagesQuery = `
      SELECT * ${baseQuery}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    queryParams.push(limit, offset);

    const result = await database.query(packagesQuery, queryParams);

    res.json({
      success: true,
      message: 'Service packages retrieved successfully',
      data: {
        packages: result.rows,
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

// Get a single service package with all included services
router.get('/:storeId/:packageId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, packageId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Get package details
    const packageResult = await database.query(
      'SELECT * FROM service_packages WHERE id = $1 AND store_id = $2',
      [packageId, storeId]
    );

    if (packageResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service package not found'
      });
    }

    const pkg = packageResult.rows[0];

    // Get package items with service details
    const itemsResult = await database.query(
      `SELECT spi.*, s.name as service_name, s.duration, s.price as service_price
       FROM service_package_items spi
       JOIN services s ON spi.service_id = s.id
       WHERE spi.package_id = $1
       ORDER BY spi.created_at`,
      [packageId]
    );

    // Build the response object matching your structure
    const packageData = {
      id: pkg.id,
      packageName: pkg.package_name,
      description: pkg.description,
      price: parseFloat(pkg.price),
      validity: {
        years: pkg.validity_years,
        months: pkg.validity_months,
        days: pkg.validity_days
      },
      services: itemsResult.rows.map(item => ({
        serviceId: item.service_id,
        serviceName: item.service_name,
        quantityType: item.quantity_type,
        qty: item.qty,
        type: item.type,
        discountValue: item.type === 'discount' ? parseFloat(item.discount_value) : undefined,
        servicePrice: parseFloat(item.service_price),
        serviceDuration: item.duration
      })),
      status: pkg.status,
      created_at: pkg.created_at,
      updated_at: pkg.updated_at
    };

    res.json({
      success: true,
      message: 'Service package retrieved successfully',
      data: {
        package: packageData
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create a new service package
router.post('/:storeId', authenticateToken, generalLimiter, validate(schemas.createServicePackage), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const {
      packageName, description, price, validity, services, status = 'active'
    } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to create packages (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create service packages for this store'
      });
    }

    // Validate that all services exist and belong to this store
    const serviceIds = services.map(s => s.serviceId);
    const serviceCheck = await database.query(
      `SELECT id FROM services WHERE id = ANY($1) AND store_id = $2`,
      [serviceIds, storeId]
    );

    if (serviceCheck.rows.length !== serviceIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more services not found or do not belong to this store'
      });
    }

    // Start transaction
    await database.query('BEGIN');

    try {
      // Create service package
      const packageResult = await database.query(
        `INSERT INTO service_packages (
          store_id, package_name, description, price, validity_years, validity_months, validity_days,
          status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
        ) RETURNING *`,
        [
          storeId, packageName, description, price,
          validity.years, validity.months, validity.days,
          status
        ]
      );

      const createdPackage = packageResult.rows[0];

      // Create package items
      for (const service of services) {
        await database.query(
          `INSERT INTO service_package_items (
            package_id, service_id, quantity_type, qty, type, discount_value, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, NOW()
          )`,
          [
            createdPackage.id, service.serviceId, service.quantityType, 
            service.qty, service.type, service.discountValue || 0
          ]
        );
      }

      // Commit transaction
      await database.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Service package created successfully',
        data: {
          package: createdPackage
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

// Update a service package
router.put('/:storeId/:packageId', authenticateToken, generalLimiter, validate(schemas.updateServicePackage), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, packageId } = req.params;
    const updateFields = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to update packages (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update service packages for this store'
      });
    }

    // Check if package exists
    const existingPackage = await database.query(
      'SELECT id FROM service_packages WHERE id = $1 AND store_id = $2',
      [packageId, storeId]
    );
    if (existingPackage.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service package not found'
      });
    }

    // Validate services if provided
    if (updateFields.services) {
      const serviceIds = updateFields.services.map(s => s.serviceId);
      const serviceCheck = await database.query(
        `SELECT id FROM services WHERE id = ANY($1) AND store_id = $2`,
        [serviceIds, storeId]
      );

      if (serviceCheck.rows.length !== serviceIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more services not found or do not belong to this store'
        });
      }
    }

    // Start transaction
    await database.query('BEGIN');

    try {
      // Build dynamic update query for main package fields
      const packageUpdateFields = [];
      const packageUpdateValues = [];
      let paramCount = 1;

      // Handle simple fields
      const simpleFields = ['packageName', 'description', 'price', 'status'];
      const dbFieldMap = {
        packageName: 'package_name'
      };

      simpleFields.forEach(field => {
        if (updateFields[field] !== undefined) {
            const dbField = dbFieldMap[field] || field;
            packageUpdateFields.push(`${dbField} = $${paramCount}`);
            packageUpdateValues.push(updateFields[field]);
            paramCount++;
        }
      });

      // Handle validity object
      if (updateFields.validity) {
        if (updateFields.validity.years !== undefined) {
          packageUpdateFields.push(`validity_years = $${paramCount}`);
          packageUpdateValues.push(updateFields.validity.years);
          paramCount++;
        }
        if (updateFields.validity.months !== undefined) {
          packageUpdateFields.push(`validity_months = $${paramCount}`);
          packageUpdateValues.push(updateFields.validity.months);
          paramCount++;
        }
        if (updateFields.validity.days !== undefined) {
          packageUpdateFields.push(`validity_days = $${paramCount}`);
          packageUpdateValues.push(updateFields.validity.days);
          paramCount++;
        }
      }

      // Update package if there are fields to update
      let updatedPackage;
      if (packageUpdateFields.length > 0) {
        packageUpdateFields.push(`updated_at = NOW()`);
        packageUpdateValues.push(packageId, storeId);

        const updateQuery = `
          UPDATE service_packages 
          SET ${packageUpdateFields.join(', ')}
          WHERE id = $${paramCount} AND store_id = $${paramCount + 1}
          RETURNING *
        `;

        const result = await database.query(updateQuery, packageUpdateValues);
        updatedPackage = result.rows[0];
      } else {
        // Get current package if no fields to update
        const result = await database.query(
          'SELECT * FROM service_packages WHERE id = $1 AND store_id = $2',
          [packageId, storeId]
        );
        updatedPackage = result.rows[0];
      }

      // Update services if provided
      if (updateFields.services) {
        // Delete existing package items
        await database.query(
          'DELETE FROM service_package_items WHERE package_id = $1',
          [packageId]
        );

        // Insert new package items
        for (const service of updateFields.services) {
          await database.query(
            `INSERT INTO service_package_items (
              package_id, service_id, quantity_type, qty, type, discount_value, created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, NOW()
            )`,
            [
              packageId, service.serviceId, service.quantityType,
              service.qty, service.type, service.discountValue || 0
            ]
          );
        }
      }

      // Commit transaction
      await database.query('COMMIT');

      res.json({
        success: true,
        message: 'Service package updated successfully',
        data: {
          package: updatedPackage
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

// Delete a service package
router.delete('/:storeId/:packageId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, packageId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to delete packages (owner only)
    if (userRole !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Only store owners can delete service packages'
      });
    }

    // Check if package exists
    const existingPackage = await database.query(
      'SELECT id, package_name FROM service_packages WHERE id = $1 AND store_id = $2',
      [packageId, storeId]
    );

    if (existingPackage.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service package not found'
      });
    }

    // Start transaction
    await database.query('BEGIN');

    try {
      // Delete package items (will be handled by CASCADE, but being explicit)
      await database.query(
        'DELETE FROM service_package_items WHERE package_id = $1',
        [packageId]
      );

      // Delete the package
      await database.query(
        'DELETE FROM service_packages WHERE id = $1 AND store_id = $2',
        [packageId, storeId]
      );

      // Commit transaction
      await database.query('COMMIT');

      res.json({
        success: true,
        message: 'Service package deleted successfully',
        data: {
          deleted_package: {
            id: packageId,
            name: existingPackage.rows[0].package_name
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
