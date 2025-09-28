const express = require('express');
const router = express.Router();
const { validate, schemas } = require('../middleware/validation');
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

// Get loyalty points configuration for a store
router.get('/:storeId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Get loyalty points configuration
    const result = await database.query(
      `SELECT 
        id,
        store_id,
        loyalty_points_conversion_rate as "loyaltyPointsConversionRate",
        service_loyalty_points as "serviceLoyaltyPoints",
        product_loyalty_points as "productLoyaltyPoints", 
  membership_loyalty_points as "membershipLoyaltyPoints",
  min_service_redemption as "minServiceRedemption",
  max_service_redemption as "maxServiceRedemption",
  min_products_redemption as "minProductsRedemption",
  max_products_redemption as "maxProductsRedemption",
  min_membership_redemption as "minMembershipRedemption",
  max_membership_redemption as "maxMembershipRedemption",
        created_at,
        updated_at
       FROM loyalty_points_configuration 
       WHERE store_id = $1`,
      [storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Loyalty points configuration not found for this store'
      });
    }

    res.json({
      success: true,
      message: 'Loyalty points configuration retrieved successfully',
      data: {
        configuration: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create loyalty points configuration for a store
router.post('/:storeId', authenticateToken, generalLimiter, validate(schemas.createLoyaltyPointsConfiguration), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const {
      loyaltyPointsConversionRate,
      serviceLoyaltyPoints,
      productLoyaltyPoints,
      membershipLoyaltyPoints,
      minServiceRedemption = 0,
      maxServiceRedemption = 0,
      minProductsRedemption = 0,
      maxProductsRedemption = 0,
      minMembershipRedemption = 0,
      maxMembershipRedemption = 0
    } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to create configuration (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create loyalty points configuration for this store'
      });
    }

    // Check if configuration already exists
    const existingConfig = await database.query(
      'SELECT id FROM loyalty_points_configuration WHERE store_id = $1',
      [storeId]
    );

    if (existingConfig.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Loyalty points configuration already exists for this store. Use PUT to update.'
      });
    }

    // Create loyalty points configuration
    const result = await database.query(
      `INSERT INTO loyalty_points_configuration (
        store_id, 
        loyalty_points_conversion_rate, 
        service_loyalty_points, 
        product_loyalty_points, 
        membership_loyalty_points,
        min_service_redemption,
        max_service_redemption,
        min_products_redemption,
        max_products_redemption,
        min_membership_redemption,
        max_membership_redemption,
        created_at, 
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()) 
      RETURNING 
        id,
        store_id,
        loyalty_points_conversion_rate as "loyaltyPointsConversionRate",
        service_loyalty_points as "serviceLoyaltyPoints",
        product_loyalty_points as "productLoyaltyPoints", 
        membership_loyalty_points as "membershipLoyaltyPoints",
        min_service_redemption as "minServiceRedemption",
        max_service_redemption as "maxServiceRedemption",
        min_products_redemption as "minProductsRedemption",
        max_products_redemption as "maxProductsRedemption",
        min_membership_redemption as "minMembershipRedemption",
        max_membership_redemption as "maxMembershipRedemption",
        created_at,
        updated_at`,
      [
        storeId,
        loyaltyPointsConversionRate,
        serviceLoyaltyPoints,
        productLoyaltyPoints,
        membershipLoyaltyPoints,
        minServiceRedemption,
        maxServiceRedemption,
        minProductsRedemption,
        maxProductsRedemption,
        minMembershipRedemption,
        maxMembershipRedemption
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Loyalty points configuration created successfully',
      data: {
        configuration: result.rows[0]
      }
    });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({
        success: false,
        message: 'Store not found'
      });
    }
    next(error);
  }
});

// Update loyalty points configuration for a store
router.put('/:storeId', authenticateToken, generalLimiter, validate(schemas.updateLoyaltyPointsConfiguration), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const updateFields = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to update configuration (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update loyalty points configuration for this store'
      });
    }

    // Check if configuration exists
    const existingConfig = await database.query(
      'SELECT id FROM loyalty_points_configuration WHERE store_id = $1',
      [storeId]
    );

    if (existingConfig.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Loyalty points configuration not found for this store'
      });
    }

    // Build dynamic update query
    const updateFieldsMap = {
      loyaltyPointsConversionRate: 'loyalty_points_conversion_rate',
      serviceLoyaltyPoints: 'service_loyalty_points',
      productLoyaltyPoints: 'product_loyalty_points',
  membershipLoyaltyPoints: 'membership_loyalty_points',
  minServiceRedemption: 'min_service_redemption',
  maxServiceRedemption: 'max_service_redemption',
  minProductsRedemption: 'min_products_redemption',
  maxProductsRedemption: 'max_products_redemption',
  minMembershipRedemption: 'min_membership_redemption',
  maxMembershipRedemption: 'max_membership_redemption'
    };

    const setParts = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updateFields).forEach(field => {
      if (updateFieldsMap[field] && updateFields[field] !== undefined) {
        setParts.push(`${updateFieldsMap[field]} = $${paramCount}`);
        values.push(updateFields[field]);
        paramCount++;
      }
    });

    if (setParts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    // Add updated_at and store_id to query
    setParts.push(`updated_at = NOW()`);
    values.push(storeId);

    const updateQuery = `
      UPDATE loyalty_points_configuration 
      SET ${setParts.join(', ')}
      WHERE store_id = $${paramCount}
      RETURNING 
        id,
        store_id,
        loyalty_points_conversion_rate as "loyaltyPointsConversionRate",
        service_loyalty_points as "serviceLoyaltyPoints",
        product_loyalty_points as "productLoyaltyPoints", 
  membership_loyalty_points as "membershipLoyaltyPoints",
  min_service_redemption as "minServiceRedemption",
  max_service_redemption as "maxServiceRedemption",
  min_products_redemption as "minProductsRedemption",
  max_products_redemption as "maxProductsRedemption",
  min_membership_redemption as "minMembershipRedemption",
  max_membership_redemption as "maxMembershipRedemption",
        created_at,
        updated_at
    `;

    const result = await database.query(updateQuery, values);

    res.json({
      success: true,
      message: 'Loyalty points configuration updated successfully',
      data: {
        configuration: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete loyalty points configuration for a store
router.delete('/:storeId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to delete configuration (owner only)
    if (userRole !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Only store owners can delete loyalty points configuration'
      });
    }

    // Check if configuration exists
    const existingConfig = await database.query(
      'SELECT id FROM loyalty_points_configuration WHERE store_id = $1',
      [storeId]
    );

    if (existingConfig.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Loyalty points configuration not found for this store'
      });
    }

    // Delete configuration
    await database.query(
      'DELETE FROM loyalty_points_configuration WHERE store_id = $1',
      [storeId]
    );

    res.json({
      success: true,
      message: 'Loyalty points configuration deleted successfully',
      data: {
        deleted_store_id: storeId
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
