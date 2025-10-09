const express = require('express');
const router = express.Router();
const database = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const Joi = require('joi');

// Validation schemas
const createEnumSchema = Joi.object({
  store_id: Joi.string().uuid().required(),
  type: Joi.string().min(1).max(100).required(),
  values: Joi.array().items(Joi.string().max(255)).default([])
});

const addValuesSchema = Joi.object({
  values: Joi.array().items(Joi.string().max(255)).min(1).required()
});

const updateValuesSchema = Joi.object({
  values: Joi.array().items(Joi.string().max(255)).required()
});

// GET /api/v1/enums/:store_id - Get all enums for a store
router.get('/:store_id', authenticateToken, async (req, res, next) => {
  try {
    const { store_id } = req.params;
    const { type } = req.query;

    // Validate store_id format
    if (!store_id || Joi.string().uuid().validate(store_id).error) {
      return res.status(400).json({
        success: false,
        message: 'Valid store_id is required'
      });
    }

    let query = 'SELECT id, type, values, created_at, updated_at FROM enums WHERE store_id = $1';
    let params = [store_id];

    // If type is specified, filter by type
    if (type) {
      query += ' AND type = $2';
      params.push(type);
    }

    query += ' ORDER BY type, created_at';

    const result = await database.query(query, params);

    res.json({
      success: true,
      message: 'Enums retrieved successfully',
      data: {
        enums: result.rows
      }
    });
  } catch (error) {
    console.error('Error fetching enums:', error);
    next(error);
  }
});

// GET /api/v1/enums/:store_id/:type - Get specific enum by type
router.get('/:store_id/:type', authenticateToken, async (req, res, next) => {
  try {
    const { store_id, type } = req.params;

    // Validate parameters
    if (!store_id || Joi.string().uuid().validate(store_id).error) {
      return res.status(400).json({
        success: false,
        message: 'Valid store_id is required'
      });
    }

    const query = 'SELECT id, type, values, created_at, updated_at FROM enums WHERE store_id = $1 AND type = $2';
    const result = await database.query(query, [store_id, type]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Enum not found'
      });
    }

    res.json({
      success: true,
      message: 'Enum retrieved successfully',
      data: {
        enum: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Error fetching enum:', error);
    next(error);
  }
});

// POST /api/v1/enums - Create a new enum
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { error, value } = createEnumSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.details[0].message
      });
    }

    const { store_id, type, values } = value;

    // Check if enum already exists
    const existingEnum = await database.query(
      'SELECT id FROM enums WHERE store_id = $1 AND type = $2',
      [store_id, type]
    );

    if (existingEnum.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Enum type already exists for this store'
      });
    }

    const query = `
      INSERT INTO enums (store_id, type, values, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING id, type, values, created_at, updated_at
    `;

    const result = await database.query(query, [store_id, type, values]);

    res.status(201).json({
      success: true,
      message: 'Enum created successfully',
      data: {
        enum: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Error creating enum:', error);
    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        message: 'Enum type already exists for this store'
      });
    }
    next(error);
  }
});

// POST /api/v1/enums/:store_id/:type/values - Add values to existing enum
router.post('/:store_id/:type/values', authenticateToken, async (req, res, next) => {
  try {
    const { store_id, type } = req.params;

    // Validate parameters
    if (!store_id || Joi.string().uuid().validate(store_id).error) {
      return res.status(400).json({
        success: false,
        message: 'Valid store_id is required'
      });
    }

    const { error, value } = addValuesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.details[0].message
      });
    }

    const { values } = value;

    // Check if enum exists
    const existingEnum = await database.query(
      'SELECT values FROM enums WHERE store_id = $1 AND type = $2',
      [store_id, type]
    );

    if (existingEnum.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Enum not found'
      });
    }

    const currentValues = existingEnum.rows[0].values || [];

    // Merge new values with existing ones (avoiding duplicates)
    const updatedValues = [...new Set([...currentValues, ...values])];

    const query = `
      UPDATE enums
      SET values = $1, updated_at = NOW()
      WHERE store_id = $2 AND type = $3
      RETURNING id, type, values, created_at, updated_at
    `;

    const result = await database.query(query, [updatedValues, store_id, type]);

    res.json({
      success: true,
      message: 'Values added to enum successfully',
      data: {
        enum: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Error adding values to enum:', error);
    next(error);
  }
});

// PATCH /api/v1/enums/:store_id/:type - Append values to existing enum (alternative to POST values)
router.patch('/:store_id/:type', authenticateToken, async (req, res, next) => {
  try {
    const { store_id, type } = req.params;

    // Validate parameters
    if (!store_id || Joi.string().uuid().validate(store_id).error) {
      return res.status(400).json({
        success: false,
        message: 'Valid store_id is required'
      });
    }

    const { error, value } = addValuesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.details[0].message
      });
    }

    const { values } = value;

    // Check if enum exists
    const existingEnum = await database.query(
      'SELECT values FROM enums WHERE store_id = $1 AND type = $2',
      [store_id, type]
    );

    if (existingEnum.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Enum not found'
      });
    }

    const currentValues = existingEnum.rows[0].values || [];

    // Append new values with existing ones (avoiding duplicates)
    const updatedValues = [...new Set([...currentValues, ...values])];

    const query = `
      UPDATE enums
      SET values = $1, updated_at = NOW()
      WHERE store_id = $2 AND type = $3
      RETURNING id, type, values, created_at, updated_at
    `;

    const result = await database.query(query, [updatedValues, store_id, type]);

    res.json({
      success: true,
      message: 'Values appended to enum successfully',
      data: {
        enum: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Error appending values to enum:', error);
    next(error);
  }
});

// PUT /api/v1/enums/:store_id/:type - Update entire enum values
router.put('/:store_id/:type', authenticateToken, async (req, res, next) => {
  try {
    const { store_id, type } = req.params;

    // Validate parameters
    if (!store_id || Joi.string().uuid().validate(store_id).error) {
      return res.status(400).json({
        success: false,
        message: 'Valid store_id is required'
      });
    }

    const { error, value } = updateValuesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.details[0].message
      });
    }

    const { values } = value;

    // Check if enum exists
    const existingEnum = await database.query(
      'SELECT id FROM enums WHERE store_id = $1 AND type = $2',
      [store_id, type]
    );

    if (existingEnum.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Enum not found'
      });
    }

    // Remove duplicates from values
    const uniqueValues = [...new Set(values)];

    const query = `
      UPDATE enums
      SET values = $1, updated_at = NOW()
      WHERE store_id = $2 AND type = $3
      RETURNING id, type, values, created_at, updated_at
    `;

    const result = await database.query(query, [uniqueValues, store_id, type]);

    res.json({
      success: true,
      message: 'Enum updated successfully',
      data: {
        enum: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Error updating enum:', error);
    next(error);
  }
});

// DELETE /api/v1/enums/:store_id/:type/values - Remove specific values from enum
router.delete('/:store_id/:type/values', authenticateToken, async (req, res, next) => {
  try {
    const { store_id, type } = req.params;

    // Validate parameters
    if (!store_id || Joi.string().uuid().validate(store_id).error) {
      return res.status(400).json({
        success: false,
        message: 'Valid store_id is required'
      });
    }

    const { error, value } = addValuesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.details[0].message
      });
    }

    const { values: valuesToRemove } = value;

    // Check if enum exists
    const existingEnum = await database.query(
      'SELECT values FROM enums WHERE store_id = $1 AND type = $2',
      [store_id, type]
    );

    if (existingEnum.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Enum not found'
      });
    }

    const currentValues = existingEnum.rows[0].values || [];

    // Remove specified values
    const updatedValues = currentValues.filter(value => !valuesToRemove.includes(value));

    const query = `
      UPDATE enums
      SET values = $1, updated_at = NOW()
      WHERE store_id = $2 AND type = $3
      RETURNING id, type, values, created_at, updated_at
    `;

    const result = await database.query(query, [updatedValues, store_id, type]);

    res.json({
      success: true,
      message: 'Values removed from enum successfully',
      data: {
        enum: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Error removing values from enum:', error);
    next(error);
  }
});

// DELETE /api/v1/enums/:store_id/:type - Delete entire enum
router.delete('/:store_id/:type', authenticateToken, async (req, res, next) => {
  try {
    const { store_id, type } = req.params;

    // Validate parameters
    if (!store_id || Joi.string().uuid().validate(store_id).error) {
      return res.status(400).json({
        success: false,
        message: 'Valid store_id is required'
      });
    }

    // Prevent deletion of default enum types
    const defaultTypes = ['serviceCategory', 'productCategory', 'roles'];
    if (defaultTypes.includes(type)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete default enum types. Use PUT to clear values instead.'
      });
    }

    const query = 'DELETE FROM enums WHERE store_id = $1 AND type = $2 RETURNING id';
    const result = await database.query(query, [store_id, type]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Enum not found'
      });
    }

    res.json({
      success: true,
      message: 'Enum deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting enum:', error);
    next(error);
  }
});

module.exports = router;
