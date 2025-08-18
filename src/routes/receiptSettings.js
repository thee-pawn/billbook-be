const express = require('express');
const router = express.Router();
const { validate, schemas } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');
const database = require('../config/database');

// Helper function to check store access
const checkStoreAccess = async (storeId, userId) => {
  const accessResult = await database.query(
    'SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2',
    [storeId, userId]
  );
  return accessResult.rows.length > 0 ? accessResult.rows[0].role : null;
};

// RECEIPT SETTINGS MANAGEMENT

// Get Receipt Settings for Store
router.get('/:storeId/receipt-settings', authenticateToken, async (req, res, next) => {
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

    // Get receipt settings for the store
    const result = await database.query(
      'SELECT * FROM receipt_settings WHERE store_id = $1',
      [storeId]
    );

    if (result.rows.length === 0) {
      // Return default settings if none exist
      return res.json({
        success: true,
        message: 'Default receipt settings retrieved (no custom settings found)',
        data: {
          receipt_settings: {
            store_id: storeId,
            logo: false,
            gst_no: false,
            staff_name: false,
            loyalty_points: false,
            wallet_balance: false,
            payment_method: false,
            date_time: false,
            customer_contact: false,
            discount: false,
            notes: null,
            updated_at: null
          }
        }
      });
    }

    const settings = result.rows[0];

    res.json({
      success: true,
      message: 'Receipt settings retrieved successfully',
      data: {
        receipt_settings: {
          id: settings.id,
          store_id: settings.store_id,
          logo: settings.logo,
          gst_no: settings.gst_no,
          staff_name: settings.staff_name,
          loyalty_points: settings.loyalty_points,
          wallet_balance: settings.wallet_balance,
          payment_method: settings.payment_method,
          date_time: settings.date_time,
          customer_contact: settings.customer_contact,
          discount: settings.discount,
          notes: settings.notes,
          updated_at: settings.updated_at
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create or Update Receipt Settings
router.post('/:storeId/receipt-settings', authenticateToken, generalLimiter, validate(schemas.createReceiptSettings), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const { logo, gst_no, staff_name, loyalty_points, wallet_balance, payment_method, date_time, customer_contact, discount, notes } = req.body;

    // Convert notes array to JSON string for JSONB storage
    const notesJson = notes ? JSON.stringify(notes) : null;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage settings (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage receipt settings for this store'
      });
    }

    // Check if settings already exist
    const existingSettings = await database.query(
      'SELECT id FROM receipt_settings WHERE store_id = $1',
      [storeId]
    );

    let result;

    if (existingSettings.rows.length > 0) {
      // Update existing settings
      result = await database.query(
        `UPDATE receipt_settings 
         SET logo = $1, gst_no = $2, staff_name = $3, loyalty_points = $4, 
             wallet_balance = $5, payment_method = $6, date_time = $7, 
             customer_contact = $8, discount = $9, notes = $10, updated_at = NOW()
         WHERE store_id = $11
         RETURNING *`,
        [logo, gst_no, staff_name, loyalty_points, wallet_balance, payment_method, 
         date_time, customer_contact, discount, notesJson, storeId]
      );
    } else {
      // Create new settings
      result = await database.query(
        `INSERT INTO receipt_settings (store_id, logo, gst_no, staff_name, loyalty_points, 
                                     wallet_balance, payment_method, date_time, customer_contact, 
                                     discount, notes, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         RETURNING *`,
        [storeId, logo, gst_no, staff_name, loyalty_points, wallet_balance, 
         payment_method, date_time, customer_contact, discount, notesJson]
      );
    }

    const settings = result.rows[0];

    res.status(existingSettings.rows.length > 0 ? 200 : 201).json({
      success: true,
      message: existingSettings.rows.length > 0 ? 'Receipt settings updated successfully' : 'Receipt settings created successfully',
      data: {
        receipt_settings: {
          id: settings.id,
          store_id: settings.store_id,
          logo: settings.logo,
          gst_no: settings.gst_no,
          staff_name: settings.staff_name,
          loyalty_points: settings.loyalty_points,
          wallet_balance: settings.wallet_balance,
          payment_method: settings.payment_method,
          date_time: settings.date_time,
          customer_contact: settings.customer_contact,
          discount: settings.discount,
          notes: settings.notes,
          updated_at: settings.updated_at
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update Receipt Settings (Partial Update)
router.put('/:storeId/receipt-settings', authenticateToken, generalLimiter, validate(schemas.updateReceiptSettings), async (req, res, next) => {
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

    // Check if user has permission to manage settings (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage receipt settings for this store'
      });
    }

    // Check if settings exist
    const existingSettings = await database.query(
      'SELECT id FROM receipt_settings WHERE store_id = $1',
      [storeId]
    );

    if (existingSettings.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Receipt settings not found. Use POST to create new settings.'
      });
    }

    // Build dynamic update query
    const updateFieldsArray = [];
    const updateValues = [];
    let paramCount = 1;

    Object.keys(updateFields).forEach(field => {
      if (updateFields[field] !== undefined) {
        updateFieldsArray.push(`${field} = $${paramCount}`);
        // Convert notes array to JSON string for JSONB storage
        if (field === 'notes') {
          updateValues.push(JSON.stringify(updateFields[field]));
        } else {
          updateValues.push(updateFields[field]);
        }
        paramCount++;
      }
    });

    // Add updated_at timestamp
    updateFieldsArray.push(`updated_at = NOW()`);
    updateValues.push(storeId);

    const updateQuery = `
      UPDATE receipt_settings 
      SET ${updateFieldsArray.join(', ')}
      WHERE store_id = $${paramCount}
      RETURNING *
    `;

    const result = await database.query(updateQuery, updateValues);
    const settings = result.rows[0];

    res.json({
      success: true,
      message: 'Receipt settings updated successfully',
      data: {
        receipt_settings: {
          id: settings.id,
          store_id: settings.store_id,
          logo: settings.logo,
          gst_no: settings.gst_no,
          staff_name: settings.staff_name,
          loyalty_points: settings.loyalty_points,
          wallet_balance: settings.wallet_balance,
          payment_method: settings.payment_method,
          date_time: settings.date_time,
          customer_contact: settings.customer_contact,
          discount: settings.discount,
          notes: settings.notes,
          updated_at: settings.updated_at
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete Receipt Settings (Reset to Defaults)
router.delete('/:storeId/receipt-settings', authenticateToken, generalLimiter, async (req, res, next) => {
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

    // Check if user has permission to manage settings (owner only)
    if (userRole !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Only store owners can delete receipt settings'
      });
    }

    // Get settings before deletion
    const settingsResult = await database.query(
      'SELECT * FROM receipt_settings WHERE store_id = $1',
      [storeId]
    );

    if (settingsResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Receipt settings not found'
      });
    }

    const settings = settingsResult.rows[0];

    // Delete settings
    await database.query(
      'DELETE FROM receipt_settings WHERE store_id = $1',
      [storeId]
    );

    res.json({
      success: true,
      message: 'Receipt settings deleted successfully. Store will use default settings.',
      data: {
        deleted_settings: {
          id: settings.id,
          store_id: settings.store_id,
          deleted_at: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
