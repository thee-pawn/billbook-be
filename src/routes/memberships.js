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

// Get all memberships for a store
router.get('/:storeId', authenticateToken, generalLimiter, validateQuery(schemas.membershipQuery), async (req, res, next) => {
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
    let baseQuery = 'FROM memberships WHERE store_id = $1';
    let queryParams = [storeId];
    let paramCount = 2;

    // Add search filter
    if (search) {
      baseQuery += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
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
    const validSortColumns = ['name', 'price', 'created_at', 'status'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const membershipsQuery = `
      SELECT * ${baseQuery}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    queryParams.push(limit, offset);

    const result = await database.query(membershipsQuery, queryParams);

    res.json({
      success: true,
      message: 'Memberships retrieved successfully',
      data: {
        memberships: result.rows,
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

// Get a single membership with all related data
router.get('/:storeId/:membershipId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, membershipId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Get membership details
    const membershipResult = await database.query(
      'SELECT * FROM memberships WHERE id = $1 AND store_id = $2',
      [membershipId, storeId]
    );

    if (membershipResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Membership not found'
      });
    }

    const membership = membershipResult.rows[0];

    // Get service inclusions
    const serviceInclusionsResult = await database.query(
      `SELECT msi.service_id, s.name as service_name
       FROM membership_service_inclusions msi
       JOIN services s ON msi.service_id = s.id
       WHERE msi.membership_id = $1`,
      [membershipId]
    );

    // Get service exclusions
    const serviceExclusionsResult = await database.query(
      `SELECT mse.service_id, s.name as service_name
       FROM membership_service_exclusions mse
       JOIN services s ON mse.service_id = s.id
       WHERE mse.membership_id = $1`,
      [membershipId]
    );

    // Get product inclusions
    const productInclusionsResult = await database.query(
      `SELECT mpi.product_id, p.name as product_name
       FROM membership_product_inclusions mpi
       JOIN products p ON mpi.product_id = p.id
       WHERE mpi.membership_id = $1`,
      [membershipId]
    );

    // Get product exclusions
    const productExclusionsResult = await database.query(
      `SELECT mpe.product_id, p.name as product_name
       FROM membership_product_exclusions mpe
       JOIN products p ON mpe.product_id = p.id
       WHERE mpe.membership_id = $1`,
      [membershipId]
    );

    // Get service packages
    const servicePackagesResult = await database.query(
      `SELECT msp.service_id, msp.quantity_type, msp.quantity_value, s.name as service_name
       FROM membership_service_packages msp
       JOIN services s ON msp.service_id = s.id
       WHERE msp.membership_id = $1`,
      [membershipId]
    );

    // Build the response object matching your structure
    const membershipData = {
      id: membership.id,
      name: membership.name,
      description: membership.description,
      price: parseFloat(membership.price),
      walletBalance: parseFloat(membership.wallet_balance),
      validity: {
        years: membership.validity_years,
        months: membership.validity_months,
        days: membership.validity_days
      },
      overallDiscount: membership.overall_discount_type ? {
        type: membership.overall_discount_type,
        value: parseFloat(membership.overall_discount_value)
      } : null,
      serviceDiscount: membership.service_discount_type ? {
        type: membership.service_discount_type,
        value: parseFloat(membership.service_discount_value),
        includedServices: serviceInclusionsResult.rows.map(row => row.service_id),
        includeAllServices: membership.service_include_all,
        excludedServices: serviceExclusionsResult.rows.map(row => row.service_id)
      } : null,
      productDiscount: membership.product_discount_type ? {
        type: membership.product_discount_type,
        value: parseFloat(membership.product_discount_value),
        includedProducts: productInclusionsResult.rows.map(row => row.product_id),
        includeAllProducts: membership.product_include_all,
        excludedProducts: productExclusionsResult.rows.map(row => row.product_id)
      } : null,
      servicePackage: {
        servicePackageId: membership.service_package_id,
        services: servicePackagesResult.rows.map(row => ({
          serviceId: row.service_id,
          serviceName: row.service_name,
          quantityType: row.quantity_type,
          quantityValue: row.quantity_value
        }))
      },
      loyaltyPoints: {
        oneTimeBonus: membership.loyalty_one_time_bonus,
        servicePointsMultiplier: parseFloat(membership.loyalty_service_multiplier),
        productPointsMultiplier: parseFloat(membership.loyalty_product_multiplier),
        membershipPointsMultiplier: parseFloat(membership.loyalty_membership_multiplier)
      },
      status: membership.status,
      created_at: membership.created_at,
      updated_at: membership.updated_at
    };

    res.json({
      success: true,
      message: 'Membership retrieved successfully',
      data: {
        membership: membershipData
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create a new membership
router.post('/:storeId', authenticateToken, generalLimiter, validate(schemas.createMembership), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const {
      name, description, price, walletBalance = 0, validity, overallDiscount,
      serviceDiscount, productDiscount, servicePackage, loyaltyPoints, status = 'active'
    } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to create memberships (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create memberships for this store'
      });
    }

    // Validate services and products exist if provided
    if (serviceDiscount && serviceDiscount.includedServices && serviceDiscount.includedServices.length > 0) {
      const serviceCheck = await database.query(
        `SELECT id FROM services WHERE id = ANY($1) AND store_id = $2`,
        [serviceDiscount.includedServices, storeId]
      );
      if (serviceCheck.rows.length !== serviceDiscount.includedServices.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more included services not found or do not belong to this store'
        });
      }
    }

    // Start transaction
    await database.query('BEGIN');

    try {
      // Create membership
      const membershipResult = await database.query(
        `INSERT INTO memberships (
          store_id, name, description, price, wallet_balance, validity_years, validity_months, validity_days,
          overall_discount_type, overall_discount_value, service_discount_type, service_discount_value, service_include_all,
          product_discount_type, product_discount_value, product_include_all, service_package_id,
          loyalty_one_time_bonus, loyalty_service_multiplier, loyalty_product_multiplier, loyalty_membership_multiplier,
          status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW()
        ) RETURNING *`,
        [
          storeId, name, description, price, walletBalance,
          validity.years, validity.months, validity.days,
          overallDiscount?.type, overallDiscount?.value,
          serviceDiscount?.type, serviceDiscount?.value, serviceDiscount?.includeAllServices || false,
          productDiscount?.type, productDiscount?.value, productDiscount?.includeAllProducts || false,
          servicePackage?.servicePackageId,
          loyaltyPoints?.oneTimeBonus || 0,
          loyaltyPoints?.servicePointsMultiplier || 1.0,
          loyaltyPoints?.productPointsMultiplier || 1.0,
          loyaltyPoints?.membershipPointsMultiplier || 1.0,
          status
        ]
      );

      const membership = membershipResult.rows[0];

      // Insert service inclusions
      if (serviceDiscount && serviceDiscount.includedServices && serviceDiscount.includedServices.length > 0) {
        for (const serviceId of serviceDiscount.includedServices) {
          await database.query(
            `INSERT INTO membership_service_inclusions (membership_id, service_id, created_at)
             VALUES ($1, $2, NOW())`,
            [membership.id, serviceId]
          );
        }
      }

      // Insert service exclusions
      if (serviceDiscount && serviceDiscount.excludedServices && serviceDiscount.excludedServices.length > 0) {
        for (const serviceId of serviceDiscount.excludedServices) {
          await database.query(
            `INSERT INTO membership_service_exclusions (membership_id, service_id, created_at)
             VALUES ($1, $2, NOW())`,
            [membership.id, serviceId]
          );
        }
      }

      // Insert product inclusions
      if (productDiscount && productDiscount.includedProducts && productDiscount.includedProducts.length > 0) {
        for (const productId of productDiscount.includedProducts) {
          await database.query(
            `INSERT INTO membership_product_inclusions (membership_id, product_id, created_at)
             VALUES ($1, $2, NOW())`,
            [membership.id, productId]
          );
        }
      }

      // Insert product exclusions
      if (productDiscount && productDiscount.excludedProducts && productDiscount.excludedProducts.length > 0) {
        for (const productId of productDiscount.excludedProducts) {
          await database.query(
            `INSERT INTO membership_product_exclusions (membership_id, product_id, created_at)
             VALUES ($1, $2, NOW())`,
            [membership.id, productId]
          );
        }
      }

      // Insert service packages
      if (servicePackage && servicePackage.services && servicePackage.services.length > 0) {
        for (const service of servicePackage.services) {
          await database.query(
            `INSERT INTO membership_service_packages (membership_id, service_id, quantity_type, quantity_value, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [membership.id, service.serviceId, service.quantityType, service.quantityValue]
          );
        }
      }

      // Commit transaction
      await database.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Membership created successfully',
        data: {
          membership: membership
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

// Update a membership
router.put('/:storeId/:membershipId', authenticateToken, generalLimiter, validate(schemas.updateMembership), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, membershipId } = req.params;
    const updateFields = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to update memberships (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update memberships for this store'
      });
    }

    // Check if membership exists
    const existingMembership = await database.query(
      'SELECT id FROM memberships WHERE id = $1 AND store_id = $2',
      [membershipId, storeId]
    );

    if (existingMembership.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Membership not found'
      });
    }

    // Start transaction
    await database.query('BEGIN');

    try {
      // Build dynamic update query for main membership fields
      const membershipUpdateFields = [];
      const membershipUpdateValues = [];
      let paramCount = 1;

      // Handle simple fields
      const simpleFields = ['name', 'description', 'price', 'walletBalance', 'status'];
      const dbFieldMap = {
        walletBalance: 'wallet_balance'
      };

      simpleFields.forEach(field => {
        if (updateFields[field] !== undefined) {
          const dbField = dbFieldMap[field] || field;
          membershipUpdateFields.push(`${dbField} = $${paramCount}`);
          membershipUpdateValues.push(updateFields[field]);
          paramCount++;
        }
      });

      // Handle validity object
      if (updateFields.validity) {
        if (updateFields.validity.years !== undefined) {
          membershipUpdateFields.push(`validity_years = $${paramCount}`);
          membershipUpdateValues.push(updateFields.validity.years);
          paramCount++;
        }
        if (updateFields.validity.months !== undefined) {
          membershipUpdateFields.push(`validity_months = $${paramCount}`);
          membershipUpdateValues.push(updateFields.validity.months);
          paramCount++;
        }
        if (updateFields.validity.days !== undefined) {
          membershipUpdateFields.push(`validity_days = $${paramCount}`);
          membershipUpdateValues.push(updateFields.validity.days);
          paramCount++;
        }
      }

      // Handle discount objects
      if (updateFields.overallDiscount) {
        membershipUpdateFields.push(`overall_discount_type = $${paramCount}`);
        membershipUpdateValues.push(updateFields.overallDiscount.type);
        paramCount++;
        membershipUpdateFields.push(`overall_discount_value = $${paramCount}`);
        membershipUpdateValues.push(updateFields.overallDiscount.value);
        paramCount++;
      }

      if (updateFields.serviceDiscount) {
        membershipUpdateFields.push(`service_discount_type = $${paramCount}`);
        membershipUpdateValues.push(updateFields.serviceDiscount.type);
        paramCount++;
        membershipUpdateFields.push(`service_discount_value = $${paramCount}`);
        membershipUpdateValues.push(updateFields.serviceDiscount.value);
        paramCount++;
        if (updateFields.serviceDiscount.includeAllServices !== undefined) {
          membershipUpdateFields.push(`service_include_all = $${paramCount}`);
          membershipUpdateValues.push(updateFields.serviceDiscount.includeAllServices);
          paramCount++;
        }
      }

      if (updateFields.productDiscount) {
        membershipUpdateFields.push(`product_discount_type = $${paramCount}`);
        membershipUpdateValues.push(updateFields.productDiscount.type);
        paramCount++;
        membershipUpdateFields.push(`product_discount_value = $${paramCount}`);
        membershipUpdateValues.push(updateFields.productDiscount.value);
        paramCount++;
        if (updateFields.productDiscount.includeAllProducts !== undefined) {
          membershipUpdateFields.push(`product_include_all = $${paramCount}`);
          membershipUpdateValues.push(updateFields.productDiscount.includeAllProducts);
          paramCount++;
        }
      }

      // Handle loyalty points
      if (updateFields.loyaltyPoints) {
        if (updateFields.loyaltyPoints.oneTimeBonus !== undefined) {
          membershipUpdateFields.push(`loyalty_one_time_bonus = $${paramCount}`);
          membershipUpdateValues.push(updateFields.loyaltyPoints.oneTimeBonus);
          paramCount++;
        }
        if (updateFields.loyaltyPoints.servicePointsMultiplier !== undefined) {
          membershipUpdateFields.push(`loyalty_service_multiplier = $${paramCount}`);
          membershipUpdateValues.push(updateFields.loyaltyPoints.servicePointsMultiplier);
          paramCount++;
        }
        if (updateFields.loyaltyPoints.productPointsMultiplier !== undefined) {
          membershipUpdateFields.push(`loyalty_product_multiplier = $${paramCount}`);
          membershipUpdateValues.push(updateFields.loyaltyPoints.productPointsMultiplier);
          paramCount++;
        }
        if (updateFields.loyaltyPoints.membershipPointsMultiplier !== undefined) {
          membershipUpdateFields.push(`loyalty_membership_multiplier = $${paramCount}`);
          membershipUpdateValues.push(updateFields.loyaltyPoints.membershipPointsMultiplier);
          paramCount++;
        }
      }

      // Update membership if there are fields to update
      let updatedMembership;
      if (membershipUpdateFields.length > 0) {
        membershipUpdateFields.push(`updated_at = NOW()`);
        membershipUpdateValues.push(membershipId, storeId);

        const updateQuery = `
          UPDATE memberships 
          SET ${membershipUpdateFields.join(', ')}
          WHERE id = $${paramCount} AND store_id = $${paramCount + 1}
          RETURNING *
        `;

        const result = await database.query(updateQuery, membershipUpdateValues);
        updatedMembership = result.rows[0];
      } else {
        // Get current membership if no fields to update
        const result = await database.query(
          'SELECT * FROM memberships WHERE id = $1 AND store_id = $2',
          [membershipId, storeId]
        );
        updatedMembership = result.rows[0];
      }

      // Update service inclusions/exclusions if provided
      if (updateFields.serviceDiscount && updateFields.serviceDiscount.includedServices !== undefined) {
        // Delete existing inclusions
        await database.query(
          'DELETE FROM membership_service_inclusions WHERE membership_id = $1',
          [membershipId]
        );

        // Insert new inclusions
        for (const serviceId of updateFields.serviceDiscount.includedServices) {
          await database.query(
            `INSERT INTO membership_service_inclusions (membership_id, service_id, created_at)
             VALUES ($1, $2, NOW())`,
            [membershipId, serviceId]
          );
        }
      }

      if (updateFields.serviceDiscount && updateFields.serviceDiscount.excludedServices !== undefined) {
        // Delete existing exclusions
        await database.query(
          'DELETE FROM membership_service_exclusions WHERE membership_id = $1',
          [membershipId]
        );

        // Insert new exclusions
        for (const serviceId of updateFields.serviceDiscount.excludedServices) {
          await database.query(
            `INSERT INTO membership_service_exclusions (membership_id, service_id, created_at)
             VALUES ($1, $2, NOW())`,
            [membershipId, serviceId]
          );
        }
      }

      // Update product inclusions/exclusions if provided
      if (updateFields.productDiscount && updateFields.productDiscount.includedProducts !== undefined) {
        // Delete existing inclusions
        await database.query(
          'DELETE FROM membership_product_inclusions WHERE membership_id = $1',
          [membershipId]
        );

        // Insert new inclusions
        for (const productId of updateFields.productDiscount.includedProducts) {
          await database.query(
            `INSERT INTO membership_product_inclusions (membership_id, product_id, created_at)
             VALUES ($1, $2, NOW())`,
            [membershipId, productId]
          );
        }
      }

      if (updateFields.productDiscount && updateFields.productDiscount.excludedProducts !== undefined) {
        // Delete existing exclusions
        await database.query(
          'DELETE FROM membership_product_exclusions WHERE membership_id = $1',
          [membershipId]
        );

        // Insert new exclusions
        for (const productId of updateFields.productDiscount.excludedProducts) {
          await database.query(
            `INSERT INTO membership_product_exclusions (membership_id, product_id, created_at)
             VALUES ($1, $2, NOW())`,
            [membershipId, productId]
          );
        }
      }

      // Update service packages if provided
      if (updateFields.servicePackage && updateFields.servicePackage.services !== undefined) {
        // Delete existing service packages
        await database.query(
          'DELETE FROM membership_service_packages WHERE membership_id = $1',
          [membershipId]
        );

        // Insert new service packages
        for (const service of updateFields.servicePackage.services) {
          await database.query(
            `INSERT INTO membership_service_packages (membership_id, service_id, quantity_type, quantity_value, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [membershipId, service.serviceId, service.quantityType, service.quantityValue]
          );
        }
      }

      // Commit transaction
      await database.query('COMMIT');

      res.json({
        success: true,
        message: 'Membership updated successfully',
        data: {
          membership: updatedMembership
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

// Delete a membership
router.delete('/:storeId/:membershipId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, membershipId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to delete memberships (owner only)
    if (userRole !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Only store owners can delete memberships'
      });
    }

    // Check if membership exists
    const existingMembership = await database.query(
      'SELECT id, name FROM memberships WHERE id = $1 AND store_id = $2',
      [membershipId, storeId]
    );

    if (existingMembership.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Membership not found'
      });
    }

    // Start transaction
    await database.query('BEGIN');

    try {
      // Delete related records (will be handled by CASCADE, but being explicit)
      await database.query('DELETE FROM membership_service_inclusions WHERE membership_id = $1', [membershipId]);
      await database.query('DELETE FROM membership_service_exclusions WHERE membership_id = $1', [membershipId]);
      await database.query('DELETE FROM membership_product_inclusions WHERE membership_id = $1', [membershipId]);
      await database.query('DELETE FROM membership_product_exclusions WHERE membership_id = $1', [membershipId]);
      await database.query('DELETE FROM membership_service_packages WHERE membership_id = $1', [membershipId]);

      // Delete the membership
      await database.query(
        'DELETE FROM memberships WHERE id = $1 AND store_id = $2',
        [membershipId, storeId]
      );

      // Commit transaction
      await database.query('COMMIT');

      res.json({
        success: true,
        message: 'Membership deleted successfully',
        data: {
          deleted_membership: {
            id: membershipId,
            name: existingMembership.rows[0].name
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
