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

// Helper function to build expense response
async function buildExpenseResponse(expense) {
  // Get employee details
  const employeeResult = await database.query(
    'SELECT name, email FROM users WHERE id = $1',
    [expense.employee_id]
  );

  // Get approver details if exists
  let approverDetails = null;
  if (expense.approved_by) {
    const approverResult = await database.query(
      'SELECT name, email FROM users WHERE id = $1',
      [expense.approved_by]
    );
    if (approverResult.rows.length > 0) {
      approverDetails = {
        id: expense.approved_by,
        name: approverResult.rows[0].name,
        email: approverResult.rows[0].email
      };
    }
  }

  return {
    id: expense.id,
    storeId: expense.store_id,
    expenseName: expense.expense_name,
    date: expense.date,
    employee: {
      id: expense.employee_id,
      name: employeeResult.rows[0]?.name || 'Unknown',
      email: employeeResult.rows[0]?.email || ''
    },
    category: expense.category,
    amount: parseFloat(expense.amount),
    paymentMethod: expense.payment_method,
    description: expense.description,
    receiptId: expense.receipt_id,
    status: expense.status,
    approvedBy: approverDetails,
    approvedAt: expense.approved_at,
    createdAt: expense.created_at,
    updatedAt: expense.updated_at
  };
}

// Get all expenses for a store
router.get('/:storeId', authenticateToken, generalLimiter, validateQuery(schemas.expenseQuery), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const {
      page = 1,
      limit = 10,
      employee_id,
      category,
      status,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      paymentMethod,
      sortBy = 'date',
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
    let baseQuery = 'FROM expenses WHERE store_id = $1';
    let queryParams = [storeId];
    let paramCount = 2;

    // Add employee filter
    if (employee_id) {
      baseQuery += ` AND employee_id = $${paramCount}`;
      queryParams.push(employee_id);
      paramCount++;
    }

    // Add category filter
    if (category) {
      baseQuery += ` AND category ILIKE $${paramCount}`;
      queryParams.push(`%${category}%`);
      paramCount++;
    }

    // Add status filter
    if (status) {
      baseQuery += ` AND status = $${paramCount}`;
      queryParams.push(status);
      paramCount++;
    }

    // Add date range filters
    if (startDate) {
      baseQuery += ` AND date >= $${paramCount}`;
      queryParams.push(startDate);
      paramCount++;
    }

    if (endDate) {
      baseQuery += ` AND date <= $${paramCount}`;
      queryParams.push(endDate);
      paramCount++;
    }

    // Add amount range filters
    if (minAmount !== undefined) {
      baseQuery += ` AND amount >= $${paramCount}`;
      queryParams.push(minAmount);
      paramCount++;
    }

    if (maxAmount !== undefined) {
      baseQuery += ` AND amount <= $${paramCount}`;
      queryParams.push(maxAmount);
      paramCount++;
    }

    // Add payment method filter
    if (paymentMethod) {
      baseQuery += ` AND payment_method ILIKE $${paramCount}`;
      queryParams.push(`%${paymentMethod}%`);
      paramCount++;
    }

    // Get total count
    const countResult = await database.query(`SELECT COUNT(*) ${baseQuery}`, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Build the main query with sorting and pagination
    const offset = (page - 1) * limit;
    const validSortColumns = ['date', 'amount', 'expense_name', 'category', 'created_at'];
    const dbColumnMap = {
      'expenseName': 'expense_name',
      'paymentMethod': 'payment_method'
    };
    const sortColumn = dbColumnMap[sortBy] || (validSortColumns.includes(sortBy) ? sortBy : 'date');
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const expensesQuery = `
      SELECT * ${baseQuery}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    queryParams.push(limit, offset);

    const result = await database.query(expensesQuery, queryParams);

    // Build response with employee details for each expense
    const expensesWithDetails = [];
    for (const expense of result.rows) {
      const expenseData = await buildExpenseResponse(expense);
      expensesWithDetails.push(expenseData);
    }

    // Calculate summary statistics
    const summaryResult = await database.query(`
      SELECT 
        COUNT(*) as total_expenses,
        SUM(amount) as total_amount,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
        SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved_amount
      ${baseQuery}
    `, queryParams.slice(0, -2)); // Remove limit and offset from summary query

    const summary = summaryResult.rows[0];

    res.json({
      success: true,
      message: 'Expenses retrieved successfully',
      data: {
        expenses: expensesWithDetails,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        summary: {
          totalExpenses: parseInt(summary.total_expenses) || 0,
          totalAmount: parseFloat(summary.total_amount || 0).toFixed(2),
          pendingCount: parseInt(summary.pending_count) || 0,
          approvedCount: parseInt(summary.approved_count) || 0,
          rejectedCount: parseInt(summary.rejected_count) || 0,
          approvedAmount: parseFloat(summary.approved_amount || 0).toFixed(2)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get expense statistics for a store (MUST BE BEFORE /:storeId/:expenseId route)
router.get('/:storeId/statistics', authenticateToken, generalLimiter, async (req, res, next) => {
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

    // Get comprehensive statistics
    const statsResult = await database.query(`
      SELECT 
        COUNT(*) as total_expenses,
        SUM(amount) as total_amount,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
        SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved_amount,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
        AVG(CASE WHEN status = 'approved' THEN amount END) as avg_approved_amount,
        MAX(amount) as max_expense,
        MIN(amount) as min_expense
      FROM expenses 
      WHERE store_id = $1
    `, [storeId]);

    // Get category breakdown
    const categoryResult = await database.query(`
      SELECT 
        category,
        COUNT(*) as count,
        SUM(amount) as total_amount,
        AVG(amount) as avg_amount
      FROM expenses 
      WHERE store_id = $1 AND status = 'approved'
      GROUP BY category
      ORDER BY total_amount DESC
    `, [storeId]);

    // Get monthly breakdown (last 12 months)
    const monthlyResult = await database.query(`
      SELECT 
        DATE_TRUNC('month', date) as month,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM expenses 
      WHERE store_id = $1 AND status = 'approved' 
        AND date >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', date)
      ORDER BY month DESC
    `, [storeId]);

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      message: 'Expense statistics retrieved successfully',
      data: {
        overview: {
          totalExpenses: parseInt(stats.total_expenses) || 0,
          totalAmount: parseFloat(stats.total_amount || 0).toFixed(2),
          pendingCount: parseInt(stats.pending_count) || 0,
          approvedCount: parseInt(stats.approved_count) || 0,
          rejectedCount: parseInt(stats.rejected_count) || 0,
          approvedAmount: parseFloat(stats.approved_amount || 0).toFixed(2),
          pendingAmount: parseFloat(stats.pending_amount || 0).toFixed(2),
          averageApprovedAmount: parseFloat(stats.avg_approved_amount || 0).toFixed(2),
          maxExpense: parseFloat(stats.max_expense || 0).toFixed(2),
          minExpense: parseFloat(stats.min_expense || 0).toFixed(2)
        },
        categoryBreakdown: categoryResult.rows.map(cat => ({
          category: cat.category,
          count: parseInt(cat.count),
          totalAmount: parseFloat(cat.total_amount).toFixed(2),
          averageAmount: parseFloat(cat.avg_amount).toFixed(2)
        })),
        monthlyBreakdown: monthlyResult.rows.map(month => ({
          month: month.month,
          count: parseInt(month.count),
          totalAmount: parseFloat(month.total_amount).toFixed(2)
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get a single expense (MUST BE AFTER /statistics route)
router.get('/:storeId/:expenseId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, expenseId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Get expense details
    const expenseResult = await database.query(
      'SELECT * FROM expenses WHERE id = $1 AND store_id = $2',
      [expenseId, storeId]
    );

    if (expenseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    const expense = expenseResult.rows[0];
    const expenseData = await buildExpenseResponse(expense);

    res.json({
      success: true,
      message: 'Expense retrieved successfully',
      data: {
        expense: expenseData
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create a new expense
router.post('/:storeId', authenticateToken, generalLimiter, validate(schemas.createExpense), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId } = req.params;
    const {
      expenseName,
      date,
      employee_id,
      category,
      amount,
      paymentMethod,
      description = '',
      receipt_id = ''
    } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to create expenses
    if (!['owner', 'manager', 'employee'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create expenses for this store'
      });
    }

    // Verify employee exists and has access to this store
    const employeeCheck = await database.query(
      'SELECT id FROM store_users WHERE store_id = $1 AND user_id = $2',
      [storeId, employee_id]
    );

    if (employeeCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Employee is not associated with this store'
      });
    }

    // Create expense
    const result = await database.query(
      `INSERT INTO expenses (
        store_id, employee_id, expense_name, date, category, amount,
        payment_method, description, receipt_id, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW(), NOW()
      ) RETURNING *`,
      [storeId, employee_id, expenseName, date, category, amount, paymentMethod, description, receipt_id]
    );

    const createdExpense = result.rows[0];
    const expenseData = await buildExpenseResponse(createdExpense);

    res.status(201).json({
      success: true,
      message: 'Expense created successfully',
      data: {
        expense: expenseData
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update expense
router.put('/:storeId/:expenseId', authenticateToken, generalLimiter, validate(schemas.updateExpense), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, expenseId } = req.params;
    const updateData = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if expense exists
    const existingExpense = await database.query(
      'SELECT * FROM expenses WHERE id = $1 AND store_id = $2',
      [expenseId, storeId]
    );

    if (existingExpense.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    const expense = existingExpense.rows[0];

    // Check permissions - only expense owner, manager, or owner can update
    if (userRole === 'employee' && expense.employee_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own expenses'
      });
    }

    // Prevent updating approved expenses unless user is owner/manager
    if (expense.status === 'approved' && !['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot update approved expenses'
      });
    }

    // Build update query dynamically
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    // Define allowed fields for update
    const allowedFields = {
      expenseName: 'expense_name',
      date: 'date',
      employee_id: 'employee_id',
      category: 'category',
      amount: 'amount',
      paymentMethod: 'payment_method',
      description: 'description',
      receipt_id: 'receipt_id'
    };

    for (const [fieldName, dbColumn] of Object.entries(allowedFields)) {
      if (updateData[fieldName] !== undefined) {
        updateFields.push(`${dbColumn} = $${paramCount++}`);
        values.push(updateData[fieldName]);
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided for update'
      });
    }

    // Verify employee exists if employee_id is being updated
    if (updateData.employee_id) {
      const employeeCheck = await database.query(
        'SELECT id FROM store_users WHERE store_id = $1 AND user_id = $2',
        [storeId, updateData.employee_id]
      );

      if (employeeCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Employee is not associated with this store'
        });
      }
    }

    // Add updated_at and expense id and store id
    updateFields.push(`updated_at = NOW()`);
    values.push(expenseId, storeId);

    const updateQuery = `
      UPDATE expenses 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount++} AND store_id = $${paramCount++}
      RETURNING *
    `;

    const result = await database.query(updateQuery, values);
    const updatedExpense = result.rows[0];
    const expenseData = await buildExpenseResponse(updatedExpense);

    res.json({
      success: true,
      message: 'Expense updated successfully',
      data: {
        expense: expenseData
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete expense
router.delete('/:storeId/:expenseId', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, expenseId } = req.params;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if expense exists
    const existingExpense = await database.query(
      'SELECT * FROM expenses WHERE id = $1 AND store_id = $2',
      [expenseId, storeId]
    );

    if (existingExpense.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    const expense = existingExpense.rows[0];

    // Check permissions - only expense owner, manager, or owner can delete
    if (userRole === 'employee' && expense.employee_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own expenses'
      });
    }

    // Prevent deleting approved expenses unless user is owner/manager
    if (expense.status === 'approved' && !['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete approved expenses'
      });
    }

    // Delete the expense
    await database.query(
      'DELETE FROM expenses WHERE id = $1 AND store_id = $2',
      [expenseId, storeId]
    );

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Approve or reject expense
router.patch('/:storeId/:expenseId/approval', authenticateToken, generalLimiter, validate(schemas.approveExpense), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { storeId, expenseId } = req.params;
    const { status, comments = '' } = req.body;

    // Check if user has access to this store
    const userRole = await checkStoreAccess(storeId, userId);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this store'
      });
    }

    // Check if user has permission to approve/reject expenses (only owner and manager)
    if (!['owner', 'manager'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to approve/reject expenses for this store'
      });
    }

    // Check if expense exists
    const existingExpense = await database.query(
      'SELECT * FROM expenses WHERE id = $1 AND store_id = $2',
      [expenseId, storeId]
    );

    if (existingExpense.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    const expense = existingExpense.rows[0];

    // Check if expense is already processed
    if (expense.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Expense is already ${expense.status}`
      });
    }

    // Update expense status
    const result = await database.query(
      `UPDATE expenses 
       SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND store_id = $4
       RETURNING *`,
      [status, userId, expenseId, storeId]
    );

    const updatedExpense = result.rows[0];
    const expenseData = await buildExpenseResponse(updatedExpense);

    res.json({
      success: true,
      message: `Expense ${status} successfully`,
      data: {
        expense: expenseData
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
