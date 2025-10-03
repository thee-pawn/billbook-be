const express = require('express');
const router = express.Router();
const database = require('../config/database');
const { generalLimiter } = require('../middleware/rateLimiter');
const { validate, validateParams, validateQuery } = require('../middleware/validation');
const {
  createSalesQuerySchema,
  updateSalesQueryStatusSchema,
  listSalesQueriesSchema,
  salesQueryIdParamSchema
} = require('../utils/salesQueryValidation');

// Helper function to map database row to response object
function mapSalesQuery(row) {
  return {
    id: row.id,
    phoneNumber: row.phone,
    email: row.email,
    name: row.name,
    query: row.query,
    status: row.status,
    created_at: row.created_at
  };
}

// Create a new sales query
router.post('/', generalLimiter, validate(createSalesQuerySchema), async (req, res, next) => {
  try {
    const { phoneNumber, email, name, query } = req.body;

    const insertQuery = `
      INSERT INTO sales_queries (phone, email, name, query, status)
      VALUES ($1, $2, $3, $4, 'open')
      RETURNING *
    `;

    const result = await database.query(insertQuery, [
      phoneNumber || null,
      email || null,
      name,
      query
    ]);

    const createdSalesQuery = mapSalesQuery(result.rows[0]);

    res.status(201).json({
      success: true,
      message: 'Sales query created successfully',
      data: createdSalesQuery
    });
  } catch (error) {
    console.error('Error creating sales query:', error);
    next(error);
  }
});

// Get all sales queries with pagination and optional filtering (oldest first)
router.get('/', generalLimiter, validateQuery(listSalesQueriesSchema), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    // Build query with optional status filter
    let whereClause = '';
    let queryParams = [limit, offset];
    let paramCount = 2;

    if (status) {
      whereClause = 'WHERE status = $3';
      queryParams.push(status);
      paramCount++;
    }

    // Get sales queries ordered by created_at (oldest first)
    const selectQuery = `
      SELECT * FROM sales_queries
      ${whereClause}
      ORDER BY created_at ASC
      LIMIT $1 OFFSET $2
    `;

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total FROM sales_queries ${whereClause}
    `;

    const [salesQueriesResult, countResult] = await Promise.all([
      database.query(selectQuery, queryParams),
      database.query(countQuery, status ? [status] : [])
    ]);

    const salesQueries = salesQueriesResult.rows.map(mapSalesQuery);
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      message: 'Sales queries retrieved successfully',
      data: {
        salesQueries,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error retrieving sales queries:', error);
    next(error);
  }
});

// Get a specific sales query by ID
router.get('/:salesQueryId', generalLimiter, validateParams(salesQueryIdParamSchema), async (req, res, next) => {
  try {
    const { salesQueryId } = req.params;

    const selectQuery = 'SELECT * FROM sales_queries WHERE id = $1';
    const result = await database.query(selectQuery, [salesQueryId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sales query not found'
      });
    }

    const salesQuery = mapSalesQuery(result.rows[0]);

    res.json({
      success: true,
      message: 'Sales query retrieved successfully',
      data: salesQuery
    });
  } catch (error) {
    console.error('Error retrieving sales query:', error);
    next(error);
  }
});

// Update sales query status (mark as closed/open)
router.patch('/:salesQueryId/status', generalLimiter, validateParams(salesQueryIdParamSchema), validate(updateSalesQueryStatusSchema), async (req, res, next) => {
  try {
    const { salesQueryId } = req.params;
    const { status } = req.body;

    // Check if sales query exists
    const checkQuery = 'SELECT id FROM sales_queries WHERE id = $1';
    const checkResult = await database.query(checkQuery, [salesQueryId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sales query not found'
      });
    }

    // Update status
    const updateQuery = `
      UPDATE sales_queries
      SET status = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await database.query(updateQuery, [status, salesQueryId]);
    const updatedSalesQuery = mapSalesQuery(result.rows[0]);

    res.json({
      success: true,
      message: `Sales query marked as ${status} successfully`,
      data: updatedSalesQuery
    });
  } catch (error) {
    console.error('Error updating sales query status:', error);
    next(error);
  }
});

module.exports = router;
