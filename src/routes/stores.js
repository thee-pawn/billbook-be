const express = require('express');
const router = express.Router();
const { validate, schemas } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');
const database = require('../config/database');

// Create Store
router.post('/', authenticateToken, generalLimiter, validate(schemas.createStore), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      name,
      mobile_no,
      whatsapp_no,
      contact_email_id,
      reporting_email_id,
      gst_number,
      tax_billing,
      business_category,
      instagram_link,
      facebook_link,
      google_maps_link,
      address_line_1,
      locality,
      city,
      state,
      country,
      pincode,
      latitude,
      longitude,
      logo_url
    } = req.body;

    // Start transaction
    await database.query('BEGIN');

    try {
      // Create store
      const storeResult = await database.query(
        `INSERT INTO stores (
          name, mobile_no, whatsapp_no, contact_email_id, reporting_email_id,
          gst_number, tax_billing, business_category, instagram_link, facebook_link,
          google_maps_link, address_line_1, locality, city, state, country,
          pincode, latitude, longitude, logo_url, created_on, updated_on
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW()
        ) RETURNING *`,
        [
          name, mobile_no, whatsapp_no, contact_email_id, reporting_email_id,
          gst_number, tax_billing, business_category, instagram_link, facebook_link,
          google_maps_link, address_line_1, locality, city, state, country,
          pincode, latitude, longitude, logo_url
        ]
      );

      const store = storeResult.rows[0];

      // Add creator to store_users table as owner
      await database.query(
        `INSERT INTO store_users (store_id, user_id, role, created_on)
         VALUES ($1, $2, $3, NOW())`,
        [store.id, userId, 'owner']
      );

      // Commit transaction
      await database.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Store created successfully',
        data: {
          store: {
            id: store.id,
            name: store.name,
            mobile_no: store.mobile_no,
            whatsapp_no: store.whatsapp_no,
            contact_email_id: store.contact_email_id,
            reporting_email_id: store.reporting_email_id,
            gst_number: store.gst_number,
            tax_billing: store.tax_billing,
            business_category: store.business_category,
            instagram_link: store.instagram_link,
            facebook_link: store.facebook_link,
            google_maps_link: store.google_maps_link,
            address_line_1: store.address_line_1,
            locality: store.locality,
            city: store.city,
            state: store.state,
            country: store.country,
            pincode: store.pincode,
            latitude: store.latitude,
            longitude: store.longitude,
            logo_url: store.logo_url,
            created_on: store.created_on,
            updated_on: store.updated_on
          },
          user_role: 'owner'
        }
      });
    } catch (error) {
      // Rollback transaction on error
      await database.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Update Store
router.put('/:storeId', authenticateToken, generalLimiter, validate(schemas.updateStore), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const updateFields = req.body;

    // Check if user has permission to update this store (owner or manager)
    const permissionResult = await database.query(
      `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
      [storeId, userId]
    );

    if (permissionResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this store'
      });
    }

    const userRole = permissionResult.rows[0].role;
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this store'
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

    if (updateFieldsArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Add updated_on timestamp
    updateFieldsArray.push(`updated_on = NOW()`);
    updateValues.push(storeId);

    const updateQuery = `
      UPDATE stores 
      SET ${updateFieldsArray.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await database.query(updateQuery, updateValues);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Store not found'
      });
    }

    const store = result.rows[0];

    res.json({
      success: true,
      message: 'Store updated successfully',
      data: {
        store: {
          id: store.id,
          name: store.name,
          mobile_no: store.mobile_no,
          whatsapp_no: store.whatsapp_no,
          contact_email_id: store.contact_email_id,
          reporting_email_id: store.reporting_email_id,
          gst_number: store.gst_number,
          tax_billing: store.tax_billing,
          business_category: store.business_category,
          instagram_link: store.instagram_link,
          facebook_link: store.facebook_link,
          google_maps_link: store.google_maps_link,
          address_line_1: store.address_line_1,
          locality: store.locality,
          city: store.city,
          state: store.state,
          country: store.country,
          pincode: store.pincode,
          latitude: store.latitude,
          longitude: store.longitude,
          logo_url: store.logo_url,
          created_on: store.created_on,
          updated_on: store.updated_on
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get Single Store
router.get('/:storeId', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;

    // Check if user has access to this store
    const accessResult = await database.query(
      `SELECT s.*, su.role 
       FROM stores s
       INNER JOIN store_users su ON s.id = su.store_id
       WHERE s.id = $1 AND su.user_id = $2`,
      [storeId, userId]
    );

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Store not found or you do not have access to this store'
      });
    }

    const storeData = accessResult.rows[0];

    res.json({
      success: true,
      message: 'Store retrieved successfully',
      data: {
        store: {
          id: storeData.id,
          name: storeData.name,
          mobile_no: storeData.mobile_no,
          whatsapp_no: storeData.whatsapp_no,
          contact_email_id: storeData.contact_email_id,
          reporting_email_id: storeData.reporting_email_id,
          gst_number: storeData.gst_number,
          tax_billing: storeData.tax_billing,
          business_category: storeData.business_category,
          instagram_link: storeData.instagram_link,
          facebook_link: storeData.facebook_link,
          google_maps_link: storeData.google_maps_link,
          address_line_1: storeData.address_line_1,
          locality: storeData.locality,
          city: storeData.city,
          state: storeData.state,
          country: storeData.country,
          pincode: storeData.pincode,
          latitude: storeData.latitude,
          longitude: storeData.longitude,
          logo_url: storeData.logo_url,
          created_on: storeData.created_on,
          updated_on: storeData.updated_on
        },
        user_role: storeData.role
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get All User's Stores
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, role } = req.query;

    const offset = (page - 1) * limit;
    
    // Build query with optional role filter
    let query = `
      SELECT s.*, su.role, su.created_on as joined_on
      FROM stores s
      INNER JOIN store_users su ON s.id = su.store_id
      WHERE su.user_id = $1
    `;
    
    const queryParams = [userId];
    let paramCount = 2;

    if (role) {
      query += ` AND su.role = $${paramCount}`;
      queryParams.push(role);
      paramCount++;
    }

    query += ` ORDER BY s.created_on DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    const result = await database.query(query, queryParams);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM stores s
      INNER JOIN store_users su ON s.id = su.store_id
      WHERE su.user_id = $1
    `;
    
    const countParams = [userId];
    if (role) {
      countQuery += ` AND su.role = $2`;
      countParams.push(role);
    }

    const countResult = await database.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    const stores = result.rows.map(store => ({
      id: store.id,
      name: store.name,
      mobile_no: store.mobile_no,
      whatsapp_no: store.whatsapp_no,
      contact_email_id: store.contact_email_id,
      reporting_email_id: store.reporting_email_id,
      gst_number: store.gst_number,
      tax_billing: store.tax_billing,
      business_category: store.business_category,
      instagram_link: store.instagram_link,
      facebook_link: store.facebook_link,
      google_maps_link: store.google_maps_link,
      address_line_1: store.address_line_1,
      locality: store.locality,
      city: store.city,
      state: store.state,
      country: store.country,
      pincode: store.pincode,
      latitude: store.latitude,
      longitude: store.longitude,
      logo_url: store.logo_url,
      created_on: store.created_on,
      updated_on: store.updated_on,
      user_role: store.role,
      joined_on: store.joined_on
    }));

    res.json({
      success: true,
      message: 'Stores retrieved successfully',
      data: {
        stores,
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

// Add User to Store
router.post('/:storeId/users', authenticateToken, generalLimiter, validate(schemas.addUserToStore), async (req, res, next) => {
  try {
    const requesterId = req.user.id;
    const { storeId } = req.params;
    const { user_id, role } = req.body;

    // Check if requester has permission to add users (owner or manager)
    const permissionResult = await database.query(
      `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
      [storeId, requesterId]
    );

    if (permissionResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    const requesterRole = permissionResult.rows[0].role;
    if (!['owner', 'manager'].includes(requesterRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to add users to this store'
      });
    }

    // Prevent non-owners from adding owners
    if (role === 'owner' && requesterRole !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Only store owners can add other owners'
      });
    }

    // Check if store exists
    const storeResult = await database.query(
      'SELECT id, name FROM stores WHERE id = $1',
      [storeId]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Store not found'
      });
    }

    // Check if user exists
    const userResult = await database.query(
      'SELECT id, name, phone_number FROM users WHERE id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is already in the store
    const existingResult = await database.query(
      'SELECT id, role FROM store_users WHERE store_id = $1 AND user_id = $2',
      [storeId, user_id]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'User is already associated with this store',
        data: {
          current_role: existingResult.rows[0].role
        }
      });
    }

    // Add user to store
    const addResult = await database.query(
      `INSERT INTO store_users (store_id, user_id, role, created_on)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [storeId, user_id, role]
    );

    const storeUser = addResult.rows[0];
    const store = storeResult.rows[0];
    const user = userResult.rows[0];

    res.status(201).json({
      success: true,
      message: 'User added to store successfully',
      data: {
        store_user: {
          id: storeUser.id,
          store_id: storeUser.store_id,
          user_id: storeUser.user_id,
          role: storeUser.role,
          created_on: storeUser.created_on
        },
        store: {
          id: store.id,
          name: store.name
        },
        user: {
          id: user.id,
          name: user.name,
          phone_number: user.phone_number
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update User Role in Store
router.put('/:storeId/users/:userId', authenticateToken, generalLimiter, validate(schemas.updateUserRole), async (req, res, next) => {
  try {
    const requesterId = req.user.id;
    const { storeId, userId } = req.params;
    const { role } = req.body;

    // Check if requester has permission to update roles (owner or manager)
    const permissionResult = await database.query(
      `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
      [storeId, requesterId]
    );

    if (permissionResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    const requesterRole = permissionResult.rows[0].role;
    if (!['owner', 'manager'].includes(requesterRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update user roles in this store'
      });
    }

    // Get current user role in store
    const currentUserResult = await database.query(
      `SELECT su.role, u.name, u.phone_number 
       FROM store_users su
       INNER JOIN users u ON su.user_id = u.id
       WHERE su.store_id = $1 AND su.user_id = $2`,
      [storeId, userId]
    );

    if (currentUserResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User is not associated with this store'
      });
    }

    const currentRole = currentUserResult.rows[0].role;

    // Prevent non-owners from updating owner roles or creating owners
    if ((currentRole === 'owner' || role === 'owner') && requesterRole !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Only store owners can modify owner roles'
      });
    }

    // Prevent users from changing their own role
    if (requesterId === userId) {
      return res.status(403).json({
        success: false,
        message: 'You cannot change your own role'
      });
    }

    // Update user role
    const updateResult = await database.query(
      `UPDATE store_users 
       SET role = $1 
       WHERE store_id = $2 AND user_id = $3
       RETURNING *`,
      [role, storeId, userId]
    );

    const updatedStoreUser = updateResult.rows[0];
    const userData = currentUserResult.rows[0];

    res.json({
      success: true,
      message: 'User role updated successfully',
      data: {
        store_user: {
          id: updatedStoreUser.id,
          store_id: updatedStoreUser.store_id,
          user_id: updatedStoreUser.user_id,
          role: updatedStoreUser.role,
          created_on: updatedStoreUser.created_on
        },
        user: {
          id: userId,
          name: userData.name,
          phone_number: userData.phone_number
        },
        previous_role: currentRole
      }
    });
  } catch (error) {
    next(error);
  }
});

// Remove User from Store
router.delete('/:storeId/users/:userId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const requesterId = req.user.id;
    const { storeId, userId } = req.params;

    // Check if requester has permission to remove users (owner or manager)
    const permissionResult = await database.query(
      `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
      [storeId, requesterId]
    );

    if (permissionResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    const requesterRole = permissionResult.rows[0].role;
    if (!['owner', 'manager'].includes(requesterRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to remove users from this store'
      });
    }

    // Get user details before removal
    const userResult = await database.query(
      `SELECT su.role, u.name, u.phone_number 
       FROM store_users su
       INNER JOIN users u ON su.user_id = u.id
       WHERE su.store_id = $1 AND su.user_id = $2`,
      [storeId, userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User is not associated with this store'
      });
    }

    const userRole = userResult.rows[0].role;

    // Prevent non-owners from removing owners
    if (userRole === 'owner' && requesterRole !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Only store owners can remove other owners'
      });
    }

    // Prevent users from removing themselves
    if (requesterId === userId) {
      return res.status(403).json({
        success: false,
        message: 'You cannot remove yourself from the store'
      });
    }

    // Check if this is the last owner
    if (userRole === 'owner') {
      const ownerCountResult = await database.query(
        `SELECT COUNT(*) as owner_count FROM store_users WHERE store_id = $1 AND role = 'owner'`,
        [storeId]
      );

      const ownerCount = parseInt(ownerCountResult.rows[0].owner_count);
      if (ownerCount <= 1) {
        return res.status(403).json({
          success: false,
          message: 'Cannot remove the last owner from the store'
        });
      }
    }

    // Remove user from store
    await database.query(
      'DELETE FROM store_users WHERE store_id = $1 AND user_id = $2',
      [storeId, userId]
    );

    res.json({
      success: true,
      message: 'User removed from store successfully',
      data: {
        removed_user: {
          id: userId,
          name: userResult.rows[0].name,
          phone_number: userResult.rows[0].phone_number,
          role: userRole
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get Store Users
router.get('/:storeId/users', authenticateToken, async (req, res, next) => {
  try {
    const requesterId = req.user.id;
    const { storeId } = req.params;
    const { page = 1, limit = 10, role } = req.query;

    // Check if user has access to this store
    const accessResult = await database.query(
      `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
      [storeId, requesterId]
    );

    if (accessResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    const offset = (page - 1) * limit;

    // Build query with optional role filter
    let query = `
      SELECT su.*, u.name, u.phone_number, u.email
      FROM store_users su
      INNER JOIN users u ON su.user_id = u.id
      WHERE su.store_id = $1
    `;
    
    const queryParams = [storeId];
    let paramCount = 2;

    if (role) {
      query += ` AND su.role = $${paramCount}`;
      queryParams.push(role);
      paramCount++;
    }

    query += ` ORDER BY su.created_on DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    const result = await database.query(query, queryParams);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM store_users su
      WHERE su.store_id = $1
    `;
    
    const countParams = [storeId];
    if (role) {
      countQuery += ` AND su.role = $2`;
      countParams.push(role);
    }

    const countResult = await database.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    const users = result.rows.map(user => ({
      id: user.id,
      user_id: user.user_id,
      role: user.role,
      created_on: user.created_on,
      user: {
        id: user.user_id,
        name: user.name,
        phone_number: user.phone_number,
        email: user.email
      }
    }));

    res.json({
      success: true,
      message: 'Store users retrieved successfully',
      data: {
        users,
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

// Import and mount receipt settings routes
const receiptSettingsRoutes = require('./receiptSettings');
router.use('/', receiptSettingsRoutes);

module.exports = router;
