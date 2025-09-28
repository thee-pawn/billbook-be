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

// Helper function to build coupon response object
function buildCouponResponse(coupon, serviceInclusions = [], productInclusions = [], membershipInclusions = []) {
  return {
    id: coupon.id,
    couponCode: coupon.coupon_code,
    description: coupon.description,
    validForm: coupon.valid_from,
    validTill: coupon.valid_till,
    discount: {
      type: coupon.discount_type,
      value: parseFloat(coupon.discount_value)
    },
    conditions: {
      minimumSpend: parseFloat(coupon.minimum_spend || 0),
      maximumDisc: coupon.maximum_discount ? parseFloat(coupon.maximum_discount) : null,
      limit: coupon.usage_limit,
      limitRefereshDays: coupon.limit_refresh_days
    },
    includedServices: {
      allIncluded: coupon.services_all_included,
      inclusions: coupon.services_all_included ? null : serviceInclusions
    },
    includedProducts: {
      allIncluded: coupon.products_all_included,
      inclusions: coupon.products_all_included ? null : productInclusions
    },
    includedMemberships: {
      allIncluded: coupon.memberships_all_included,
      inclusions: coupon.memberships_all_included ? null : membershipInclusions
    },
    status: coupon.status,
    created_at: coupon.created_at,
    updated_at: coupon.updated_at,
    usage: coupon.usage
  };
}

// Get all coupons for a store
router.get('/:storeId', authenticateToken, generalLimiter, validateQuery(schemas.couponQuery), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      search, 
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
    let baseQuery = 'FROM coupons WHERE store_id = $1';
    let queryParams = [storeId];
    let paramCount = 2;

    // Add search filter
    if (search) {
      baseQuery += ` AND (coupon_code ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
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
    const validSortColumns = ['coupon_code', 'valid_from', 'valid_till', 'discount_value', 'created_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const couponsQuery = `
      SELECT * ${baseQuery}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    queryParams.push(limit, offset);

    const result = await database.query(couponsQuery, queryParams);

    // Build response with inclusions for each coupon
    const couponsWithInclusions = [];
    for (const coupon of result.rows) {
      // Get service inclusions if not all included
      let serviceInclusions = [];
      if (!coupon.services_all_included) {
        const serviceResult = await database.query(
          'SELECT service_id FROM coupon_service_inclusions WHERE coupon_id = $1',
          [coupon.id]
        );
        serviceInclusions = serviceResult.rows.map(row => row.service_id);
      }

      // Get product inclusions if not all included
      let productInclusions = [];
      if (!coupon.products_all_included) {
        const productResult = await database.query(
          'SELECT product_id FROM coupon_product_inclusions WHERE coupon_id = $1',
          [coupon.id]
        );
        productInclusions = productResult.rows.map(row => row.product_id);
      }

      // Get membership inclusions if not all included
      let membershipInclusions = [];
      if (!coupon.memberships_all_included) {
        const membershipResult = await database.query(
          'SELECT membership_id FROM coupon_membership_inclusions WHERE coupon_id = $1',
          [coupon.id]
        );
        membershipInclusions = membershipResult.rows.map(row => row.membership_id);
      }

      couponsWithInclusions.push(buildCouponResponse(coupon, serviceInclusions, productInclusions, membershipInclusions));
    }

    res.json({
      success: true,
      message: 'Coupons retrieved successfully',
      data: {
        coupons: couponsWithInclusions,
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

// Get a single coupon with all details
router.get('/:storeId/:couponId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, couponId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Get coupon details
    const couponResult = await database.query(
      'SELECT * FROM coupons WHERE id = $1 AND store_id = $2',
      [couponId, storeId]
    );

    if (couponResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    const coupon = couponResult.rows[0];

    // Get inclusions
    let serviceInclusions = [];
    if (!coupon.services_all_included) {
      const serviceResult = await database.query(
        `SELECT csi.service_id, s.name as service_name 
         FROM coupon_service_inclusions csi
         JOIN services s ON csi.service_id = s.id
         WHERE csi.coupon_id = $1`,
        [couponId]
      );
      serviceInclusions = serviceResult.rows.map(row => ({
        id: row.service_id,
        name: row.service_name
      }));
    }

    let productInclusions = [];
    if (!coupon.products_all_included) {
      const productResult = await database.query(
        `SELECT cpi.product_id, p.name as product_name 
         FROM coupon_product_inclusions cpi
         JOIN products p ON cpi.product_id = p.id
         WHERE cpi.coupon_id = $1`,
        [couponId]
      );
      productInclusions = productResult.rows.map(row => ({
        id: row.product_id,
        name: row.product_name
      }));
    }

    let membershipInclusions = [];
    if (!coupon.memberships_all_included) {
      const membershipResult = await database.query(
        `SELECT cmi.membership_id, m.membership_name 
         FROM coupon_membership_inclusions cmi
         JOIN memberships m ON cmi.membership_id = m.id
         WHERE cmi.coupon_id = $1`,
        [couponId]
      );
      membershipInclusions = membershipResult.rows.map(row => ({
        id: row.membership_id,
        name: row.membership_name
      }));
    }

    const couponData = buildCouponResponse(coupon, serviceInclusions, productInclusions, membershipInclusions);

    res.json({
      success: true,
      message: 'Coupon retrieved successfully',
      data: {
        coupon: couponData
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create a new coupon
router.post('/:storeId', authenticateToken, generalLimiter, validate(schemas.createCoupon), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const {
      couponCode, description, validForm, validTill, discount, conditions = {},
      includedServices = {}, includedProducts = {}, includedMemberships = {},
      status = 'active'
    } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to create coupons (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create coupons for this store'
      });
    }

    // Validate included items exist in the store if specified
    if (includedServices?.inclusions?.length > 0) {
      const serviceCheck = await database.query(
        `SELECT id FROM services WHERE id = ANY($1) AND store_id = $2`,
        [includedServices.inclusions, storeId]
      );
      if (serviceCheck.rows.length !== includedServices.inclusions.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more services not found or do not belong to this store'
        });
      }
    }

    if (includedProducts?.inclusions?.length > 0) {
      const productCheck = await database.query(
        `SELECT id FROM products WHERE id = ANY($1) AND store_id = $2`,
        [includedProducts.inclusions, storeId]
      );
      if (productCheck.rows.length !== includedProducts.inclusions.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more products not found or do not belong to this store'
        });
      }
    }

    if (includedMemberships?.inclusions?.length > 0) {
      const membershipCheck = await database.query(
        `SELECT id FROM memberships WHERE id = ANY($1) AND store_id = $2`,
        [includedMemberships.inclusions, storeId]
      );
      if (membershipCheck.rows.length !== includedMemberships.inclusions.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more memberships not found or do not belong to this store'
        });
      }
    }

    // Start transaction
    await database.query('BEGIN');

    try {
      // Create coupon
      const couponResult = await database.query(
        `INSERT INTO coupons (
          store_id, coupon_code, description, valid_from, valid_till, discount_type, discount_value,
          minimum_spend, maximum_discount, usage_limit, limit_refresh_days,
          services_all_included, products_all_included, memberships_all_included,
          status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW()
        ) RETURNING *`,
        [
          storeId, couponCode, description, validForm, validTill, discount.type, discount.value,
          conditions.minimumSpend || 0, conditions.maximumDisc, conditions.limit || 1, conditions.limitRefereshDays || 30,
          includedServices.allIncluded || false, includedProducts.allIncluded || false, includedMemberships.allIncluded || false,
          status
        ]
      );

      const createdCoupon = couponResult.rows[0];

      // Add service inclusions
      if (includedServices?.inclusions?.length > 0) {
        for (const serviceId of includedServices.inclusions) {
          await database.query(
            `INSERT INTO coupon_service_inclusions (coupon_id, service_id, created_at) VALUES ($1, $2, NOW())`,
            [createdCoupon.id, serviceId]
          );
        }
      }

      // Add product inclusions
      if (includedProducts?.inclusions?.length > 0) {
        for (const productId of includedProducts.inclusions) {
          await database.query(
            `INSERT INTO coupon_product_inclusions (coupon_id, product_id, created_at) VALUES ($1, $2, NOW())`,
            [createdCoupon.id, productId]
          );
        }
      }

      // Add membership inclusions
      if (includedMemberships?.inclusions?.length > 0) {
        for (const membershipId of includedMemberships.inclusions) {
          await database.query(
            `INSERT INTO coupon_membership_inclusions (coupon_id, membership_id, created_at) VALUES ($1, $2, NOW())`,
            [createdCoupon.id, membershipId]
          );
        }
      }

      // Commit transaction
      await database.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Coupon created successfully',
        data: {
          coupon: buildCouponResponse(
            createdCoupon,
            includedServices?.inclusions || [],
            includedProducts?.inclusions || [],
            includedMemberships?.inclusions || []
          )
        }
      });
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists for this store'
      });
    }
    next(error);
  }
});

// Update a coupon
router.put('/:storeId/:couponId', authenticateToken, generalLimiter, validate(schemas.updateCoupon), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, couponId } = req.params;
    const updateFields = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to update coupons (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update coupons for this store'
      });
    }

    // Check if coupon exists
    const existingCoupon = await database.query(
      'SELECT id FROM coupons WHERE id = $1 AND store_id = $2',
      [couponId, storeId]
    );

    if (existingCoupon.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    // Validate included items if provided
    if (updateFields.includedServices?.inclusions?.length > 0) {
      const serviceCheck = await database.query(
        `SELECT id FROM services WHERE id = ANY($1) AND store_id = $2`,
        [updateFields.includedServices.inclusions, storeId]
      );
      if (serviceCheck.rows.length !== updateFields.includedServices.inclusions.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more services not found or do not belong to this store'
        });
      }
    }

    if (updateFields.includedProducts?.inclusions?.length > 0) {
      const productCheck = await database.query(
        `SELECT id FROM products WHERE id = ANY($1) AND store_id = $2`,
        [updateFields.includedProducts.inclusions, storeId]
      );
      if (productCheck.rows.length !== updateFields.includedProducts.inclusions.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more products not found or do not belong to this store'
        });
      }
    }

    if (updateFields.includedMemberships?.inclusions?.length > 0) {
      const membershipCheck = await database.query(
        `SELECT id FROM memberships WHERE id = ANY($1) AND store_id = $2`,
        [updateFields.includedMemberships.inclusions, storeId]
      );
      if (membershipCheck.rows.length !== updateFields.includedMemberships.inclusions.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more memberships not found or do not belong to this store'
        });
      }
    }

    // Start transaction
    await database.query('BEGIN');

    try {
      // Build dynamic update query for coupon
      const couponUpdateFields = [];
      const couponUpdateValues = [];
      let paramCount = 1;

      // Handle simple fields
      const fieldMap = {
        couponCode: 'coupon_code',
        description: 'description',
        validForm: 'valid_from',
        validTill: 'valid_till',
        status: 'status'
      };

      Object.keys(fieldMap).forEach(field => {
        if (updateFields[field] !== undefined) {
          couponUpdateFields.push(`${fieldMap[field]} = $${paramCount}`);
          couponUpdateValues.push(updateFields[field]);
          paramCount++;
        }
      });

      // Handle discount object
      if (updateFields.discount) {
        couponUpdateFields.push(`discount_type = $${paramCount}`, `discount_value = $${paramCount + 1}`);
        couponUpdateValues.push(updateFields.discount.type, updateFields.discount.value);
        paramCount += 2;
      }

      // Handle conditions object
      if (updateFields.conditions) {
        const conditionFields = {
          minimumSpend: 'minimum_spend',
          maximumDisc: 'maximum_discount',
          limit: 'usage_limit',
          limitRefereshDays: 'limit_refresh_days'
        };

        Object.keys(conditionFields).forEach(field => {
          if (updateFields.conditions[field] !== undefined) {
            couponUpdateFields.push(`${conditionFields[field]} = $${paramCount}`);
            couponUpdateValues.push(updateFields.conditions[field]);
            paramCount++;
          }
        });
      }

      // Handle inclusion flags
      if (updateFields.includedServices) {
        couponUpdateFields.push(`services_all_included = $${paramCount}`);
        couponUpdateValues.push(updateFields.includedServices.allIncluded);
        paramCount++;
      }

      if (updateFields.includedProducts) {
        couponUpdateFields.push(`products_all_included = $${paramCount}`);
        couponUpdateValues.push(updateFields.includedProducts.allIncluded);
        paramCount++;
      }

      if (updateFields.includedMemberships) {
        couponUpdateFields.push(`memberships_all_included = $${paramCount}`);
        couponUpdateValues.push(updateFields.includedMemberships.allIncluded);
        paramCount++;
      }

      // Update coupon if there are fields to update
      let updatedCoupon;
      if (couponUpdateFields.length > 0) {
        couponUpdateFields.push(`updated_at = NOW()`);
        couponUpdateValues.push(couponId, storeId);

        const updateQuery = `
          UPDATE coupons 
          SET ${couponUpdateFields.join(', ')}
          WHERE id = $${paramCount} AND store_id = $${paramCount + 1}
          RETURNING *
        `;

        const result = await database.query(updateQuery, couponUpdateValues);
        updatedCoupon = result.rows[0];
      } else {
        const result = await database.query(
          'SELECT * FROM coupons WHERE id = $1 AND store_id = $2',
          [couponId, storeId]
        );
        updatedCoupon = result.rows[0];
      }

      // Update inclusions if provided
      if (updateFields.includedServices) {
        await database.query('DELETE FROM coupon_service_inclusions WHERE coupon_id = $1', [couponId]);
        if (updateFields.includedServices.inclusions?.length > 0) {
          for (const serviceId of updateFields.includedServices.inclusions) {
            await database.query(
              `INSERT INTO coupon_service_inclusions (coupon_id, service_id, created_at) VALUES ($1, $2, NOW())`,
              [couponId, serviceId]
            );
          }
        }
      }

      if (updateFields.includedProducts) {
        await database.query('DELETE FROM coupon_product_inclusions WHERE coupon_id = $1', [couponId]);
        if (updateFields.includedProducts.inclusions?.length > 0) {
          for (const productId of updateFields.includedProducts.inclusions) {
            await database.query(
              `INSERT INTO coupon_product_inclusions (coupon_id, product_id, created_at) VALUES ($1, $2, NOW())`,
              [couponId, productId]
            );
          }
        }
      }

      if (updateFields.includedMemberships) {
        await database.query('DELETE FROM coupon_membership_inclusions WHERE coupon_id = $1', [couponId]);
        if (updateFields.includedMemberships.inclusions?.length > 0) {
          for (const membershipId of updateFields.includedMemberships.inclusions) {
            await database.query(
              `INSERT INTO coupon_membership_inclusions (coupon_id, membership_id, created_at) VALUES ($1, $2, NOW())`,
              [couponId, membershipId]
            );
          }
        }
      }

      // Commit transaction
      await database.query('COMMIT');

      res.json({
        success: true,
        message: 'Coupon updated successfully',
        data: {
          coupon: updatedCoupon
        }
      });
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists for this store'
      });
    }
    next(error);
  }
});

// Delete a coupon
router.delete('/:storeId/:couponId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, couponId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to delete coupons (owner only)
    if (userRole !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Only store owners can delete coupons'
      });
    }

    // Check if coupon exists
    const existingCoupon = await database.query(
      'SELECT id, coupon_code FROM coupons WHERE id = $1 AND store_id = $2',
      [couponId, storeId]
    );

    if (existingCoupon.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    // Start transaction
    await database.query('BEGIN');

    try {
      // Delete inclusions (will be handled by CASCADE, but being explicit)
      await database.query('DELETE FROM coupon_service_inclusions WHERE coupon_id = $1', [couponId]);
      await database.query('DELETE FROM coupon_product_inclusions WHERE coupon_id = $1', [couponId]);
      await database.query('DELETE FROM coupon_membership_inclusions WHERE coupon_id = $1', [couponId]);

      // Delete the coupon
      await database.query('DELETE FROM coupons WHERE id = $1 AND store_id = $2', [couponId, storeId]);

      // Commit transaction
      await database.query('COMMIT');

      res.json({
        success: true,
        message: 'Coupon deleted successfully',
        data: {
          deleted_coupon: {
            id: couponId,
            couponCode: existingCoupon.rows[0].coupon_code
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

// Validate and apply coupon (for order processing)
router.post('/:storeId/validate', authenticateToken, generalLimiter, validate(schemas.validateCoupon), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const { couponCode, orderAmount, serviceIds = [], productIds = [], membershipIds = [] } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Get coupon details
    const couponResult = await database.query(
      `SELECT * FROM coupons 
       WHERE coupon_code = $1 AND store_id = $2 AND status = 'active'
       AND valid_from <= CURRENT_DATE AND valid_till >= CURRENT_DATE`,
      [couponCode, storeId]
    );

    if (couponResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired coupon code'
      });
    }

    const coupon = couponResult.rows[0];

    // Check minimum spend
    if (orderAmount < coupon.minimum_spend) {
      return res.status(400).json({
        success: false,
        message: `Minimum spend of $${coupon.minimum_spend} required to use this coupon`
      });
    }

    // Check usage limit
    const usageCount = await database.query(
      `SELECT COUNT(*) FROM coupon_usage 
       WHERE coupon_id = $1 AND user_id = $2 
       AND usage_date >= NOW() - INTERVAL '${coupon.limit_refresh_days} days'`,
      [coupon.id, userId]
    );

    if (parseInt(usageCount.rows[0].count) >= coupon.usage_limit) {
      return res.status(400).json({
        success: false,
        message: `Coupon usage limit of ${coupon.usage_limit} reached`
      });
    }

    // Check service inclusions
    if (!coupon.services_all_included && serviceIds.length > 0) {
      const includedServices = await database.query(
        'SELECT service_id FROM coupon_service_inclusions WHERE coupon_id = $1',
        [coupon.id]
      );
      const includedServiceIds = includedServices.rows.map(row => row.service_id);
      const hasValidServices = serviceIds.some(id => includedServiceIds.includes(id));
      
      if (!hasValidServices) {
        return res.status(400).json({
          success: false,
          message: 'Coupon is not applicable to the selected services'
        });
      }
    }

    // Check product inclusions
    if (!coupon.products_all_included && productIds.length > 0) {
      const includedProducts = await database.query(
        'SELECT product_id FROM coupon_product_inclusions WHERE coupon_id = $1',
        [coupon.id]
      );
      const includedProductIds = includedProducts.rows.map(row => row.product_id);
      const hasValidProducts = productIds.some(id => includedProductIds.includes(id));
      
      if (!hasValidProducts) {
        return res.status(400).json({
          success: false,
          message: 'Coupon is not applicable to the selected products'
        });
      }
    }

    // Check membership inclusions
    if (!coupon.memberships_all_included && membershipIds.length > 0) {
      const includedMemberships = await database.query(
        'SELECT membership_id FROM coupon_membership_inclusions WHERE coupon_id = $1',
        [coupon.id]
      );
      const includedMembershipIds = includedMemberships.rows.map(row => row.membership_id);
      const hasValidMemberships = membershipIds.some(id => includedMembershipIds.includes(id));
      
      if (!hasValidMemberships) {
        return res.status(400).json({
          success: false,
          message: 'Coupon is not applicable to the selected memberships'
        });
      }
    }

    // Calculate discount
    let discountAmount;
    if (coupon.discount_type === 'percentage') {
      discountAmount = (orderAmount * coupon.discount_value) / 100;
      if (coupon.maximum_discount && discountAmount > coupon.maximum_discount) {
        discountAmount = coupon.maximum_discount;
      }
    } else {
      discountAmount = Math.min(coupon.discount_value, orderAmount);
    }

    res.json({
      success: true,
      message: 'Coupon is valid',
      data: {
        coupon: {
          id: coupon.id,
          couponCode: coupon.coupon_code,
          discountType: coupon.discount_type,
          discountValue: parseFloat(coupon.discount_value)
        },
        discount: {
          amount: parseFloat(discountAmount.toFixed(2)),
          finalAmount: parseFloat((orderAmount - discountAmount).toFixed(2))
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

// Get eligible coupons for a customer/order context
router.get('/:storeId/eligible', authenticateToken, generalLimiter, validateQuery(schemas.eligibleCouponsQuery), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const {
      customerId,
      phoneNumber,
      orderAmount,
      date,
      serviceIds = [],
      productIds = [],
      membershipIds = []
    } = req.query;

    // Check store access
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({ success: false, message: 'You do not have access to this store' });
    }

    // Resolve customer by phone if provided and no customerId
    let resolvedCustomerId = customerId;
    if (!resolvedCustomerId && phoneNumber) {
      const customerRes = await database.query(
        'SELECT id FROM customers WHERE store_id = $1 AND phone_number = $2',
        [storeId, phoneNumber.trim()]
      );
      if (customerRes.rows.length > 0) {
        resolvedCustomerId = customerRes.rows[0].id;
      }
    }

    // Build base query for active and date-valid coupons under store
    const queryParams = [storeId];
    let baseWhere = `WHERE c.store_id = $1 AND c.status = 'active'`;

    // Apply date filter (use provided date or today)
    if (date) {
      queryParams.push(date);
      baseWhere += ` AND c.valid_from <= $${queryParams.length} AND c.valid_till >= $${queryParams.length}`;
    } else {
      baseWhere += ` AND c.valid_from <= CURRENT_DATE AND c.valid_till >= CURRENT_DATE`;
    }

    // If orderAmount present, enforce minimum spend at DB level
    if (orderAmount !== undefined) {
      queryParams.push(orderAmount);
      baseWhere += ` AND c.minimum_spend <= $${queryParams.length}`;
    }

    const couponsSql = `SELECT c.* FROM coupons c ${baseWhere} ORDER BY c.created_at DESC`;
    const couponsRes = await database.query(couponsSql, queryParams);

    const eligible = [];
    for (const coupon of couponsRes.rows) {
      // Check inclusions for provided items; if none provided for a category and not all included, we don't exclude based on that category
      let ok = true;

      if (!coupon.services_all_included && serviceIds && serviceIds.length > 0) {
        const svcRes = await database.query('SELECT service_id FROM coupon_service_inclusions WHERE coupon_id = $1', [coupon.id]);
        const included = new Set(svcRes.rows.map(r => r.service_id));
        const hasIntersect = serviceIds.some(id => included.has(id));
        if (!hasIntersect) ok = false;
      }

      if (!coupon.products_all_included && productIds && productIds.length > 0) {
        const prodRes = await database.query('SELECT product_id FROM coupon_product_inclusions WHERE coupon_id = $1', [coupon.id]);
        const included = new Set(prodRes.rows.map(r => r.product_id));
        const hasIntersect = productIds.some(id => included.has(id));
        if (!hasIntersect) ok = false;
      }

      if (!coupon.memberships_all_included && membershipIds && membershipIds.length > 0) {
        const memRes = await database.query('SELECT membership_id FROM coupon_membership_inclusions WHERE coupon_id = $1', [coupon.id]);
        const included = new Set(memRes.rows.map(r => r.membership_id));
        const hasIntersect = membershipIds.some(id => included.has(id));
        if (!hasIntersect) ok = false;
      }

      if (!ok) continue;

      // Check per-user usage limit if customer identified
      let usageExceeded = false;
      if (resolvedCustomerId && coupon.usage_limit && coupon.limit_refresh_days) {
        const usageCount = await database.query(
          `SELECT COUNT(*) FROM coupon_usage 
           WHERE coupon_id = $1 AND user_id = $2 
           AND usage_date >= NOW() - INTERVAL '${coupon.limit_refresh_days} days'`,
          [coupon.id, resolvedCustomerId]
        );
        usageExceeded = parseInt(usageCount.rows[0].count) >= coupon.usage_limit;
      }
      if (usageExceeded) continue;

      // Gather inclusions for response consistency
      let serviceInclusions = [];
      if (!coupon.services_all_included) {
        const serviceResult = await database.query('SELECT service_id FROM coupon_service_inclusions WHERE coupon_id = $1', [coupon.id]);
        serviceInclusions = serviceResult.rows.map(row => row.service_id);
      }
      let productInclusions = [];
      if (!coupon.products_all_included) {
        const productResult = await database.query('SELECT product_id FROM coupon_product_inclusions WHERE coupon_id = $1', [coupon.id]);
        productInclusions = productResult.rows.map(row => row.product_id);
      }
      let membershipInclusions = [];
      if (!coupon.memberships_all_included) {
        const membershipResult = await database.query('SELECT membership_id FROM coupon_membership_inclusions WHERE coupon_id = $1', [coupon.id]);
        membershipInclusions = membershipResult.rows.map(row => row.membership_id);
      }

      const couponData = buildCouponResponse(coupon, serviceInclusions, productInclusions, membershipInclusions);

      // Optional compute discount preview
      let computed = undefined;
      if (orderAmount !== undefined) {
        let discountAmount;
        if (coupon.discount_type === 'percentage') {
          discountAmount = (orderAmount * parseFloat(coupon.discount_value)) / 100;
          if (coupon.maximum_discount && discountAmount > parseFloat(coupon.maximum_discount)) {
            discountAmount = parseFloat(coupon.maximum_discount);
          }
        } else {
          discountAmount = Math.min(parseFloat(coupon.discount_value), parseFloat(orderAmount));
        }
        const finalAmount = Math.max(0, parseFloat(orderAmount) - discountAmount);
        computed = {
          amount: parseFloat(discountAmount.toFixed(2)),
          finalAmount: parseFloat(finalAmount.toFixed(2))
        };
      }

      eligible.push({ ...couponData, computed });
    }

    res.json({
      success: true,
      message: 'Eligible coupons retrieved successfully',
      data: { coupons: eligible }
    });
  } catch (error) {
    next(error);
  }
});
