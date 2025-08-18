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

// SHIFTS MANAGEMENT

// Create Shift
router.post('/:storeId/shifts', authenticateToken, generalLimiter, validate(schemas.createShift), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const { day, opening_time, closing_time, is_24_hrs_open, is_closed } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage shifts (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage shifts for this store'
      });
    }

    // Check if shift for this day already exists
    const existingShift = await database.query(
      'SELECT id FROM shifts WHERE store_id = $1 AND day = $2',
      [storeId, day]
    );

    if (existingShift.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Shift for ${day} already exists. Use update API to modify it.`
      });
    }

    // Create shift
    const result = await database.query(
      `INSERT INTO shifts (day, opening_time, closing_time, is_24_hrs_open, is_closed, store_id, created_on, updated_on)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [day, opening_time, closing_time, is_24_hrs_open, is_closed, storeId]
    );

    const shift = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'Shift created successfully',
      data: {
        shift: {
          id: shift.id,
          day: shift.day,
          opening_time: shift.opening_time,
          closing_time: shift.closing_time,
          is_24_hrs_open: shift.is_24_hrs_open,
          is_closed: shift.is_closed,
          store_id: shift.store_id,
          created_on: shift.created_on,
          updated_on: shift.updated_on
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create Multiple Shifts (Bulk)
router.post('/:storeId/shifts/bulk', authenticateToken, generalLimiter, validate(schemas.createBulkShifts), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const { shifts } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage shifts (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage shifts for this store'
      });
    }

    // Check for existing shifts for any of the provided days
    const daysToCheck = shifts.map(shift => shift.day);
    const existingShifts = await database.query(
      'SELECT day FROM shifts WHERE store_id = $1 AND day = ANY($2)',
      [storeId, daysToCheck]
    );

    if (existingShifts.rows.length > 0) {
      const existingDays = existingShifts.rows.map(row => row.day);
      return res.status(409).json({
        success: false,
        message: `Shifts for the following days already exist: ${existingDays.join(', ')}. Use update API to modify them.`
      });
    }

    // Use transaction to ensure all shifts are created or none
    const createdShifts = await database.transaction(async (client) => {
      const results = [];
      
      for (const shift of shifts) {
        const { day, opening_time, closing_time, is_24_hrs_open, is_closed } = shift;
        
        const result = await client.query(
          `INSERT INTO shifts (day, opening_time, closing_time, is_24_hrs_open, is_closed, store_id, created_on, updated_on)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           RETURNING *`,
          [day, opening_time, closing_time, is_24_hrs_open, is_closed, storeId]
        );
        
        results.push(result.rows[0]);
      }
      
      return results;
    });

    // Format response
    const formattedShifts = createdShifts.map(shift => ({
      id: shift.id,
      day: shift.day,
      opening_time: shift.opening_time,
      closing_time: shift.closing_time,
      is_24_hrs_open: shift.is_24_hrs_open,
      is_closed: shift.is_closed,
      store_id: shift.store_id,
      created_on: shift.created_on,
      updated_on: shift.updated_on
    }));

    res.status(201).json({
      success: true,
      message: `${createdShifts.length} shifts created successfully`,
      data: {
        shifts: formattedShifts,
        count: createdShifts.length
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get All Shifts for Store
router.get('/:storeId/shifts', authenticateToken, async (req, res, next) => {
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

    // Get all shifts for the store
    const result = await database.query(
      `SELECT * FROM shifts WHERE store_id = $1 ORDER BY 
       CASE day 
         WHEN 'monday' THEN 1
         WHEN 'tuesday' THEN 2
         WHEN 'wednesday' THEN 3
         WHEN 'thursday' THEN 4
         WHEN 'friday' THEN 5
         WHEN 'saturday' THEN 6
         WHEN 'sunday' THEN 7
       END`,
      [storeId]
    );

    const shifts = result.rows.map(shift => ({
      id: shift.id,
      day: shift.day,
      opening_time: shift.opening_time,
      closing_time: shift.closing_time,
      is_24_hrs_open: shift.is_24_hrs_open,
      is_closed: shift.is_closed,
      store_id: shift.store_id,
      created_on: shift.created_on,
      updated_on: shift.updated_on
    }));

    res.json({
      success: true,
      message: 'Shifts retrieved successfully',
      data: {
        shifts,
        store_id: storeId
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get Specific Shift
router.get('/:storeId/shifts/:shiftId', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, shiftId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Get specific shift
    const result = await database.query(
      'SELECT * FROM shifts WHERE id = $1 AND store_id = $2',
      [shiftId, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    const shift = result.rows[0];

    res.json({
      success: true,
      message: 'Shift retrieved successfully',
      data: {
        shift: {
          id: shift.id,
          day: shift.day,
          opening_time: shift.opening_time,
          closing_time: shift.closing_time,
          is_24_hrs_open: shift.is_24_hrs_open,
          is_closed: shift.is_closed,
          store_id: shift.store_id,
          created_on: shift.created_on,
          updated_on: shift.updated_on
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update Shift
router.put('/:storeId/shifts/:shiftId', authenticateToken, generalLimiter, validate(schemas.updateShift), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, shiftId } = req.params;
    const updateFields = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage shifts (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage shifts for this store'
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
    updateValues.push(shiftId, storeId);

    const updateQuery = `
      UPDATE shifts 
      SET ${updateFieldsArray.join(', ')}
      WHERE id = $${paramCount} AND store_id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await database.query(updateQuery, updateValues);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    const shift = result.rows[0];

    res.json({
      success: true,
      message: 'Shift updated successfully',
      data: {
        shift: {
          id: shift.id,
          day: shift.day,
          opening_time: shift.opening_time,
          closing_time: shift.closing_time,
          is_24_hrs_open: shift.is_24_hrs_open,
          is_closed: shift.is_closed,
          store_id: shift.store_id,
          created_on: shift.created_on,
          updated_on: shift.updated_on
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update Multiple Shifts (Bulk)
router.put('/:storeId/shifts', authenticateToken, generalLimiter, validate(schemas.updateBulkShifts), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const { shifts } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage shifts (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage shifts for this store'
      });
    }

    // Start transaction
    await database.query('BEGIN');

    try {
      const updatedShifts = [];

      // Update each shift
      for (const shift of shifts) {
        const { id, day, opening_time, closing_time, is_24_hrs_open, is_closed } = shift;

        // Verify the shift belongs to this store
        const shiftCheck = await database.query(
          'SELECT id FROM shifts WHERE id = $1 AND store_id = $2',
          [id, storeId]
        );

        if (shiftCheck.rows.length === 0) {
          throw new Error(`Shift with ID ${id} not found in this store`);
        }

        // Update the shift
        const updateQuery = `
          UPDATE shifts 
          SET day = $1, opening_time = $2, closing_time = $3, is_24_hrs_open = $4, is_closed = $5, updated_on = CURRENT_TIMESTAMP
          WHERE id = $6 AND store_id = $7
          RETURNING *
        `;

        const result = await database.query(updateQuery, [
          day, opening_time, closing_time, is_24_hrs_open, is_closed, id, storeId
        ]);

        if (result.rows.length > 0) {
          const updatedShift = result.rows[0];
          updatedShifts.push({
            id: updatedShift.id,
            day: updatedShift.day,
            opening_time: updatedShift.opening_time,
            closing_time: updatedShift.closing_time,
            is_24_hrs_open: updatedShift.is_24_hrs_open,
            is_closed: updatedShift.is_closed,
            store_id: updatedShift.store_id,
            created_on: updatedShift.created_on,
            updated_on: updatedShift.updated_on
          });
        }
      }

      // Commit transaction
      await database.query('COMMIT');

      res.json({
        success: true,
        message: `${updatedShifts.length} shifts updated successfully`,
        data: {
          shifts: updatedShifts,
          count: updatedShifts.length
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

// Delete Shift
router.delete('/:storeId/shifts/:shiftId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, shiftId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage shifts (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage shifts for this store'
      });
    }

    // Get shift details before deletion
    const shiftResult = await database.query(
      'SELECT * FROM shifts WHERE id = $1 AND store_id = $2',
      [shiftId, storeId]
    );

    if (shiftResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    const shift = shiftResult.rows[0];

    // Delete shift
    await database.query(
      'DELETE FROM shifts WHERE id = $1 AND store_id = $2',
      [shiftId, storeId]
    );

    res.json({
      success: true,
      message: 'Shift deleted successfully',
      data: {
        deleted_shift: {
          id: shift.id,
          day: shift.day,
          opening_time: shift.opening_time,
          closing_time: shift.closing_time,
          is_24_hrs_open: shift.is_24_hrs_open,
          is_closed: shift.is_closed
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// SPECIAL SHIFTS MANAGEMENT

// Create Special Shift
router.post('/:storeId/special-shifts', authenticateToken, generalLimiter, validate(schemas.createSpecialShift), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const { date, name, opening_time, closing_time, is_24_hours_open, is_closed } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage shifts (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage special shifts for this store'
      });
    }

    // Check if special shift for this date already exists
    const existingShift = await database.query(
      'SELECT id FROM special_shifts WHERE store_id = $1 AND date = $2',
      [storeId, date]
    );

    if (existingShift.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Special shift for ${date} already exists. Use update API to modify it.`
      });
    }

    // Create special shift
    const result = await database.query(
      `INSERT INTO special_shifts (date, name, opening_time, closing_time, is_24_hours_open, is_closed, store_id, created_on, updated_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [date, name || null, opening_time, closing_time, is_24_hours_open, is_closed, storeId]
    );

    const specialShift = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'Special shift created successfully',
      data: {
        special_shift: {
          id: specialShift.id,
          date: specialShift.date,
          name: specialShift.name,
          opening_time: specialShift.opening_time,
          closing_time: specialShift.closing_time,
          is_24_hours_open: specialShift.is_24_hours_open,
          is_closed: specialShift.is_closed,
          store_id: specialShift.store_id,
          created_on: specialShift.created_on,
          updated_on: specialShift.updated_on
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create Multiple Special Shifts (Bulk)
router.post('/:storeId/special-shifts/bulk', authenticateToken, generalLimiter, validate(schemas.createBulkSpecialShifts), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const { special_shifts } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage shifts (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage special shifts for this store'
      });
    }

    // Check for existing special shifts for any of the provided dates
    const datesToCheck = special_shifts.map(shift => shift.date);
    const existingShifts = await database.query(
      'SELECT date FROM special_shifts WHERE store_id = $1 AND date = ANY($2)',
      [storeId, datesToCheck]
    );

    if (existingShifts.rows.length > 0) {
      const existingDates = existingShifts.rows.map(row => new Date(row.date).toISOString().split('T')[0]);
      return res.status(409).json({
        success: false,
        message: `Special shifts for the following dates already exist: ${existingDates.join(', ')}. Use update API to modify them.`
      });
    }

    // Use transaction to ensure all special shifts are created or none
    const createdSpecialShifts = await database.transaction(async (client) => {
      const results = [];
      
      for (const shift of special_shifts) {
        const { date, name, opening_time, closing_time, is_24_hours_open, is_closed } = shift;
        
        const result = await client.query(
          `INSERT INTO special_shifts (date, name, opening_time, closing_time, is_24_hours_open, is_closed, store_id, created_on, updated_on)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           RETURNING *`,
          [date, name || null, opening_time, closing_time, is_24_hours_open, is_closed, storeId]
        );
        
        results.push(result.rows[0]);
      }
      
      return results;
    });

    // Format response
    const formattedSpecialShifts = createdSpecialShifts.map(shift => ({
      id: shift.id,
      date: shift.date,
      name: shift.name,
      opening_time: shift.opening_time,
      closing_time: shift.closing_time,
      is_24_hours_open: shift.is_24_hours_open,
      is_closed: shift.is_closed,
      store_id: shift.store_id,
      created_on: shift.created_on,
      updated_on: shift.updated_on
    }));

    res.status(201).json({
      success: true,
      message: `${createdSpecialShifts.length} special shifts created successfully`,
      data: {
        special_shifts: formattedSpecialShifts,
        count: createdSpecialShifts.length
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get All Special Shifts for Store
router.get('/:storeId/special-shifts', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const { page = 1, limit = 20, from_date, to_date } = req.query;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    const offset = (page - 1) * limit;

    // Build query with optional date range filter and exclude past dates
    let query = `SELECT * FROM special_shifts WHERE store_id = $1 AND date >= CURRENT_DATE`;
    const queryParams = [storeId];
    let paramCount = 2;

    if (from_date) {
      query += ` AND date >= $${paramCount}`;
      queryParams.push(from_date);
      paramCount++;
    }

    if (to_date) {
      query += ` AND date <= $${paramCount}`;
      queryParams.push(to_date);
      paramCount++;
    }

    query += ` ORDER BY date ASC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    const result = await database.query(query, queryParams);

    // Get total count for pagination (also excluding past dates)
    let countQuery = `SELECT COUNT(*) as total FROM special_shifts WHERE store_id = $1 AND date >= CURRENT_DATE`;
    const countParams = [storeId];
    let countParamCount = 2;

    if (from_date) {
      countQuery += ` AND date >= $${countParamCount}`;
      countParams.push(from_date);
      countParamCount++;
    }

    if (to_date) {
      countQuery += ` AND date <= $${countParamCount}`;
      countParams.push(to_date);
    }

    const countResult = await database.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    const specialShifts = result.rows.map(shift => ({
      id: shift.id,
      date: shift.date,
      name: shift.name,
      opening_time: shift.opening_time,
      closing_time: shift.closing_time,
      is_24_hours_open: shift.is_24_hours_open,
      is_closed: shift.is_closed,
      store_id: shift.store_id,
      created_on: shift.created_on,
      updated_on: shift.updated_on
    }));

    res.json({
      success: true,
      message: 'Upcoming special shifts retrieved successfully',
      data: {
        special_shifts: specialShifts,
        store_id: storeId,
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

// Get Specific Special Shift
router.get('/:storeId/special-shifts/:specialShiftId', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, specialShiftId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Get specific special shift
    const result = await database.query(
      'SELECT * FROM special_shifts WHERE id = $1 AND store_id = $2',
      [specialShiftId, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Special shift not found'
      });
    }

    const specialShift = result.rows[0];

    res.json({
      success: true,
      message: 'Special shift retrieved successfully',
      data: {
        special_shift: {
          id: specialShift.id,
          date: specialShift.date,
          name: specialShift.name,
          opening_time: specialShift.opening_time,
          closing_time: specialShift.closing_time,
          is_24_hours_open: specialShift.is_24_hours_open,
          is_closed: specialShift.is_closed,
          store_id: specialShift.store_id,
          created_on: specialShift.created_on,
          updated_on: specialShift.updated_on
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update Special Shift
router.put('/:storeId/special-shifts/:specialShiftId', authenticateToken, generalLimiter, validate(schemas.updateSpecialShift), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, specialShiftId } = req.params;
    const updateFields = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage shifts (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage special shifts for this store'
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
    updateValues.push(specialShiftId, storeId);

    const updateQuery = `
      UPDATE special_shifts 
      SET ${updateFieldsArray.join(', ')}
      WHERE id = $${paramCount} AND store_id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await database.query(updateQuery, updateValues);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Special shift not found'
      });
    }

    const specialShift = result.rows[0];

    res.json({
      success: true,
      message: 'Special shift updated successfully',
      data: {
        special_shift: {
          id: specialShift.id,
          date: specialShift.date,
          name: specialShift.name,
          opening_time: specialShift.opening_time,
          closing_time: specialShift.closing_time,
          is_24_hours_open: specialShift.is_24_hours_open,
          is_closed: specialShift.is_closed,
          store_id: specialShift.store_id,
          created_on: specialShift.created_on,
          updated_on: specialShift.updated_on
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete Special Shift
router.delete('/:storeId/special-shifts/:specialShiftId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, specialShiftId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to manage shifts (owner or manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage special shifts for this store'
      });
    }

    // Get special shift details before deletion
    const specialShiftResult = await database.query(
      'SELECT * FROM special_shifts WHERE id = $1 AND store_id = $2',
      [specialShiftId, storeId]
    );

    if (specialShiftResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Special shift not found'
      });
    }

    const specialShift = specialShiftResult.rows[0];

    // Delete special shift
    await database.query(
      'DELETE FROM special_shifts WHERE id = $1 AND store_id = $2',
      [specialShiftId, storeId]
    );

    res.json({
      success: true,
      message: 'Special shift deleted successfully',
      data: {
        deleted_special_shift: {
          id: specialShift.id,
          date: specialShift.date,
          opening_time: specialShift.opening_time,
          closing_time: specialShift.closing_time,
          is_24_hours_open: specialShift.is_24_hours_open,
          is_closed: specialShift.is_closed
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// STORE AVAILABILITY API

// Get Store Availability for Specific Date
router.get('/:storeId/availability', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const { date } = req.query;

    // Validate date parameter
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required (format: YYYY-MM-DD)'
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD format'
      });
    }

    const requestedDate = new Date(date);
    if (isNaN(requestedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date provided'
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

    // First, check for special shifts on the requested date (higher priority)
    const specialShiftResult = await database.query(
      'SELECT * FROM special_shifts WHERE store_id = $1 AND date = $2',
      [storeId, date]
    );

    if (specialShiftResult.rows.length > 0) {
      const specialShift = specialShiftResult.rows[0];
      
      return res.json({
        success: true,
        message: 'Store availability retrieved successfully',
        data: {
          store_id: storeId,
          date: date,
          availability_type: 'special_shift',
          shift_info: {
            id: specialShift.id,
            name: specialShift.name,
            opening_time: specialShift.opening_time,
            closing_time: specialShift.closing_time,
            is_24_hours_open: specialShift.is_24_hours_open,
            is_closed: specialShift.is_closed
          },
          is_open: !specialShift.is_closed,
          is_24_hours: specialShift.is_24_hours_open,
          opening_time: specialShift.is_closed ? null : specialShift.opening_time,
          closing_time: specialShift.is_closed ? null : specialShift.closing_time
        }
      });
    }

    // If no special shift, check regular weekly shifts
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayOfWeek = dayNames[requestedDate.getDay()];

    const regularShiftResult = await database.query(
      'SELECT * FROM shifts WHERE store_id = $1 AND day = $2',
      [storeId, dayOfWeek]
    );

    if (regularShiftResult.rows.length > 0) {
      const regularShift = regularShiftResult.rows[0];
      
      return res.json({
        success: true,
        message: 'Store availability retrieved successfully',
        data: {
          store_id: storeId,
          date: date,
          availability_type: 'regular_shift',
          shift_info: {
            id: regularShift.id,
            day: regularShift.day,
            opening_time: regularShift.opening_time,
            closing_time: regularShift.closing_time,
            is_24_hrs_open: regularShift.is_24_hrs_open,
            is_closed: regularShift.is_closed
          },
          is_open: !regularShift.is_closed,
          is_24_hours: regularShift.is_24_hrs_open,
          opening_time: regularShift.is_closed ? null : regularShift.opening_time,
          closing_time: regularShift.is_closed ? null : regularShift.closing_time
        }
      });
    }

    // No shifts found for this day/date
    return res.json({
      success: true,
      message: 'Store availability retrieved successfully',
      data: {
        store_id: storeId,
        date: date,
        availability_type: 'no_shift_defined',
        shift_info: null,
        is_open: false,
        is_24_hours: false,
        opening_time: null,
        closing_time: null
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
