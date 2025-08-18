const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { validate, validateParams } = require('../middleware/validation');
const { generalLimiter } = require('../middleware/rateLimiter');
const database = require('../config/database');
const {
    createStaffPaymentSchema,
    updateStaffPaymentSchema,
    updatePaymentStatusSchema,
    storeIdSchema,
    paymentIdSchema,
    storePaymentIdSchema,
    staffPaymentQuerySchema
} = require('../utils/staffPaymentValidation');

/**
 * Create Staff Payment
 * POST /api/staff-payments/:storeId
 */
router.post('/:storeId',
    authenticateToken,
    generalLimiter,
    validateParams(storeIdSchema),
    validate(createStaffPaymentSchema),
    async (req, res) => {
        try {
            const { storeId } = req.params;
            const userId = req.user.id;
            const {
                staffId,
                paymentPeriod,
                amount,
                accountNumber,
                ifscCode,
                paymentBreakdown,
                paymentMethod,
                paymentReference,
                notes
            } = req.body;

            // Check if user has access to this store
            const storeAccess = await database.query(
                `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
                [storeId, userId]
            );

            if (storeAccess.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to access this store'
                });
            }

            // Only owners and managers can create payments
            if (!['owner', 'manager'].includes(storeAccess.rows[0].role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only owners and managers can create staff payments'
                });
            }

            // Start transaction
            await database.query('BEGIN');

            // Verify staff exists and belongs to this store
            const staffResult = await database.query(
                `SELECT s.*, s.account_number as staff_account_number, s.ifsc_code as staff_ifsc_code 
                 FROM staff s WHERE s.id = $1 AND s.store_id = $2 AND s.status = 'active'`,
                [staffId, storeId]
            );

            if (staffResult.rows.length === 0) {
                await database.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    message: 'Staff member not found or inactive'
                });
            }

            const staff = staffResult.rows[0];

            // Check for existing payment in the same period
            const existingPayment = await database.query(
                `SELECT id FROM staff_payments 
                 WHERE staff_id = $1 AND payment_period_from = $2 AND payment_period_to = $3 
                 AND payment_status != 'cancelled'`,
                [staffId, paymentPeriod.from, paymentPeriod.to]
            );

            if (existingPayment.rows.length > 0) {
                await database.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: 'Payment already exists for this period'
                });
            }

            // Use staff banking details if not provided in request
            const finalAccountNumber = accountNumber || staff.staff_account_number;
            const finalIfscCode = ifscCode || staff.staff_ifsc_code;

            // Validate breakdown totals
            const calculatedTotal = paymentBreakdown.earnings.total - paymentBreakdown.deductions.totalDeductions;
            if (Math.abs(calculatedTotal - amount) > 0.01) {
                await database.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: 'Payment amount does not match calculated total from breakdown'
                });
            }

            // Create payment record
            const paymentResult = await database.query(
                `INSERT INTO staff_payments (
                    staff_id, store_id, user_id, payment_period_from, payment_period_to,
                    amount, account_number, ifsc_code, payment_breakdown, payment_method,
                    payment_reference, notes, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                 RETURNING *`,
                [
                    staffId, storeId, userId, paymentPeriod.from, paymentPeriod.to,
                    amount, finalAccountNumber, finalIfscCode, JSON.stringify(paymentBreakdown),
                    paymentMethod, paymentReference, notes
                ]
            );

            // Log activity
            await database.query(
                `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at) 
                 VALUES ($1, 'STAFF_PAYMENT_CREATED', 'staff_payment', $2, $3, CURRENT_TIMESTAMP)`,
                [
                    userId,
                    paymentResult.rows[0].id,
                    JSON.stringify({
                        staffId,
                        storeId,
                        amount,
                        paymentPeriod,
                        paymentMethod
                    })
                ]
            );

            // Commit transaction
            await database.query('COMMIT');

            const payment = paymentResult.rows[0];

            res.status(201).json({
                success: true,
                message: 'Staff payment created successfully',
                data: {
                    payment: {
                        id: payment.id,
                        staffId: payment.staff_id,
                        storeId: payment.store_id,
                        paymentPeriod: {
                            from: payment.payment_period_from,
                            to: payment.payment_period_to
                        },
                        amount: parseFloat(payment.amount),
                        accountNumber: payment.account_number,
                        ifscCode: payment.ifsc_code,
                        paymentBreakdown: payment.payment_breakdown,
                        paymentStatus: payment.payment_status,
                        paymentMethod: payment.payment_method,
                        paymentReference: payment.payment_reference,
                        paymentDate: payment.payment_date,
                        notes: payment.notes,
                        createdAt: payment.created_at,
                        updatedAt: payment.updated_at
                    }
                }
            });

        } catch (error) {
            await database.query('ROLLBACK');
            console.error('Error creating staff payment:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create staff payment'
            });
        }
    }
);

/**
 * Get Staff Payments
 * GET /api/staff-payments/:storeId
 */
router.get('/:storeId',
    authenticateToken,
    validateParams(storeIdSchema),
    validate(staffPaymentQuerySchema, 'query'),
    async (req, res) => {
        try {
            const { storeId } = req.params;
            const userId = req.user.id;
            const {
                staffId,
                status,
                paymentMethod,
                fromDate,
                toDate,
                page = 1,
                limit = 10
            } = req.query;

            // Check if user has access to this store
            const storeAccess = await database.query(
                `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
                [storeId, userId]
            );

            if (storeAccess.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to access this store'
                });
            }

            // Build query conditions
            let queryConditions = 'WHERE sp.store_id = $1';
            let queryParams = [storeId];
            let paramCount = 1;

            if (staffId) {
                paramCount++;
                queryConditions += ` AND sp.staff_id = $${paramCount}`;
                queryParams.push(staffId);
            }

            if (status) {
                paramCount++;
                queryConditions += ` AND sp.payment_status = $${paramCount}`;
                queryParams.push(status);
            }

            if (paymentMethod) {
                paramCount++;
                queryConditions += ` AND sp.payment_method = $${paramCount}`;
                queryParams.push(paymentMethod);
            }

            if (fromDate) {
                paramCount++;
                queryConditions += ` AND sp.payment_period_from >= $${paramCount}`;
                queryParams.push(fromDate);
            }

            if (toDate) {
                paramCount++;
                queryConditions += ` AND sp.payment_period_to <= $${paramCount}`;
                queryParams.push(toDate);
            }

            // Calculate offset for pagination
            const offset = (page - 1) * limit;

            // Get total count
            const countResult = await database.query(
                `SELECT COUNT(*) as total FROM staff_payments sp ${queryConditions}`,
                queryParams
            );

            const totalPayments = parseInt(countResult.rows[0].total);

            // Get payments with staff details
            const paymentsResult = await database.query(
                `SELECT sp.*, s.name as staff_name, s.designation, s.contact, s.email,
                        u.name as processed_by_name
                 FROM staff_payments sp
                 LEFT JOIN staff s ON sp.staff_id = s.id
                 LEFT JOIN users u ON sp.user_id = u.id
                 ${queryConditions}
                 ORDER BY sp.created_at DESC
                 LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
                [...queryParams, limit, offset]
            );

            const payments = paymentsResult.rows.map(payment => ({
                id: payment.id,
                staffId: payment.staff_id,
                staffName: payment.staff_name,
                staffDesignation: payment.designation,
                staffContact: payment.contact,
                staffEmail: payment.email,
                storeId: payment.store_id,
                paymentPeriod: {
                    from: payment.payment_period_from,
                    to: payment.payment_period_to
                },
                amount: parseFloat(payment.amount),
                accountNumber: payment.account_number,
                ifscCode: payment.ifsc_code,
                paymentBreakdown: payment.payment_breakdown,
                paymentStatus: payment.payment_status,
                paymentMethod: payment.payment_method,
                paymentReference: payment.payment_reference,
                paymentDate: payment.payment_date,
                notes: payment.notes,
                processedBy: payment.processed_by_name,
                createdAt: payment.created_at,
                updatedAt: payment.updated_at
            }));

            res.json({
                success: true,
                data: {
                    payments,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages: Math.ceil(totalPayments / limit),
                        totalPayments,
                        hasNextPage: page * limit < totalPayments,
                        hasPreviousPage: page > 1
                    }
                }
            });

        } catch (error) {
            console.error('Error fetching staff payments:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch staff payments'
            });
        }
    }
);

/**
 * Get Single Staff Payment
 * GET /api/staff-payments/:storeId/:paymentId
 */
router.get('/:storeId/:paymentId',
    authenticateToken,
    validateParams(storePaymentIdSchema),
    async (req, res) => {
        try {
            const { storeId, paymentId } = req.params;
            const userId = req.user.id;

            // Check if user has access to this store
            const storeAccess = await database.query(
                `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
                [storeId, userId]
            );

            if (storeAccess.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to access this store'
                });
            }

            // Get payment with staff details
            const paymentResult = await database.query(
                `SELECT sp.*, s.name as staff_name, s.designation, s.contact, s.email,
                        u.name as processed_by_name
                 FROM staff_payments sp
                 LEFT JOIN staff s ON sp.staff_id = s.id
                 LEFT JOIN users u ON sp.user_id = u.id
                 WHERE sp.id = $1 AND sp.store_id = $2`,
                [paymentId, storeId]
            );

            if (paymentResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Staff payment not found'
                });
            }

            const payment = paymentResult.rows[0];

            res.json({
                success: true,
                data: {
                    payment: {
                        id: payment.id,
                        staffId: payment.staff_id,
                        staffName: payment.staff_name,
                        staffDesignation: payment.designation,
                        staffContact: payment.contact,
                        staffEmail: payment.email,
                        storeId: payment.store_id,
                        paymentPeriod: {
                            from: payment.payment_period_from,
                            to: payment.payment_period_to
                        },
                        amount: parseFloat(payment.amount),
                        accountNumber: payment.account_number,
                        ifscCode: payment.ifsc_code,
                        paymentBreakdown: payment.payment_breakdown,
                        paymentStatus: payment.payment_status,
                        paymentMethod: payment.payment_method,
                        paymentReference: payment.payment_reference,
                        paymentDate: payment.payment_date,
                        notes: payment.notes,
                        processedBy: payment.processed_by_name,
                        createdAt: payment.created_at,
                        updatedAt: payment.updated_at
                    }
                }
            });

        } catch (error) {
            console.error('Error fetching staff payment:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch staff payment'
            });
        }
    }
);

/**
 * Update Staff Payment
 * PUT /api/staff-payments/:storeId/:paymentId
 */
router.put('/:storeId/:paymentId',
    authenticateToken,
    validateParams(storePaymentIdSchema),
    validate(updateStaffPaymentSchema),
    async (req, res) => {
        try {
            const { storeId, paymentId } = req.params;
            const userId = req.user.id;
            const updates = req.body;

            // Check if user has access to this store
            const storeAccess = await database.query(
                `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
                [storeId, userId]
            );

            if (storeAccess.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to access this store'
                });
            }

            // Only owners and managers can update payments
            if (!['owner', 'manager'].includes(storeAccess.rows[0].role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only owners and managers can update staff payments'
                });
            }

            // Start transaction
            await database.query('BEGIN');

            // Check if payment exists
            const existingPayment = await database.query(
                `SELECT * FROM staff_payments WHERE id = $1 AND store_id = $2`,
                [paymentId, storeId]
            );

            if (existingPayment.rows.length === 0) {
                await database.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    message: 'Staff payment not found'
                });
            }

            const currentPayment = existingPayment.rows[0];

            // Don't allow updates to paid payments unless changing to failed/cancelled
            if (currentPayment.payment_status === 'paid' && updates.paymentStatus && 
                !['failed', 'cancelled'].includes(updates.paymentStatus)) {
                await database.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: 'Cannot modify paid payments except to mark as failed or cancelled'
                });
            }

            // Build update query dynamically
            const updateFields = [];
            const updateValues = [];
            let paramCount = 0;

            const fieldMapping = {
                paymentPeriod: { from: 'payment_period_from', to: 'payment_period_to' },
                amount: 'amount',
                accountNumber: 'account_number',
                ifscCode: 'ifsc_code',
                paymentBreakdown: 'payment_breakdown',
                paymentStatus: 'payment_status',
                paymentMethod: 'payment_method',
                paymentReference: 'payment_reference',
                paymentDate: 'payment_date',
                notes: 'notes'
            };

            for (const [key, value] of Object.entries(updates)) {
                if (fieldMapping[key]) {
                    if (key === 'paymentPeriod') {
                        paramCount++;
                        updateFields.push(`payment_period_from = $${paramCount}`);
                        updateValues.push(value.from);
                        
                        paramCount++;
                        updateFields.push(`payment_period_to = $${paramCount}`);
                        updateValues.push(value.to);
                    } else {
                        paramCount++;
                        updateFields.push(`${fieldMapping[key]} = $${paramCount}`);
                        
                        if (key === 'paymentBreakdown') {
                            updateValues.push(JSON.stringify(value));
                        } else {
                            updateValues.push(value);
                        }
                    }
                }
            }

            if (updateFields.length === 0) {
                await database.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: 'No valid fields to update'
                });
            }

            // Add updated_at field
            paramCount++;
            updateFields.push(`updated_at = $${paramCount}`);
            updateValues.push(new Date());

            // Add WHERE conditions
            paramCount++;
            updateValues.push(paymentId);
            paramCount++;
            updateValues.push(storeId);

            const updateQuery = `
                UPDATE staff_payments 
                SET ${updateFields.join(', ')} 
                WHERE id = $${paramCount - 1} AND store_id = $${paramCount}
                RETURNING *
            `;

            const result = await database.query(updateQuery, updateValues);

            // Log activity
            await database.query(
                `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at) 
                 VALUES ($1, 'STAFF_PAYMENT_UPDATED', 'staff_payment', $2, $3, CURRENT_TIMESTAMP)`,
                [
                    userId,
                    paymentId,
                    JSON.stringify({
                        updatedFields: Object.keys(updates),
                        storeId
                    })
                ]
            );

            // Commit transaction
            await database.query('COMMIT');

            const updatedPayment = result.rows[0];

            res.json({
                success: true,
                message: 'Staff payment updated successfully',
                data: {
                    payment: {
                        id: updatedPayment.id,
                        staffId: updatedPayment.staff_id,
                        storeId: updatedPayment.store_id,
                        paymentPeriod: {
                            from: updatedPayment.payment_period_from,
                            to: updatedPayment.payment_period_to
                        },
                        amount: parseFloat(updatedPayment.amount),
                        accountNumber: updatedPayment.account_number,
                        ifscCode: updatedPayment.ifsc_code,
                        paymentBreakdown: updatedPayment.payment_breakdown,
                        paymentStatus: updatedPayment.payment_status,
                        paymentMethod: updatedPayment.payment_method,
                        paymentReference: updatedPayment.payment_reference,
                        paymentDate: updatedPayment.payment_date,
                        notes: updatedPayment.notes,
                        createdAt: updatedPayment.created_at,
                        updatedAt: updatedPayment.updated_at
                    }
                }
            });

        } catch (error) {
            await database.query('ROLLBACK');
            console.error('Error updating staff payment:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update staff payment'
            });
        }
    }
);

/**
 * Update Payment Status
 * PATCH /api/staff-payments/:storeId/:paymentId/status
 */
router.patch('/:storeId/:paymentId/status',
    authenticateToken,
    validateParams(storePaymentIdSchema),
    validate(updatePaymentStatusSchema),
    async (req, res) => {
        try {
            const { storeId, paymentId } = req.params;
            const userId = req.user.id;
            const {
                paymentStatus,
                paymentMethod,
                paymentReference,
                paymentDate,
                notes
            } = req.body;

            // Check if user has access to this store
            const storeAccess = await database.query(
                `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
                [storeId, userId]
            );

            if (storeAccess.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to access this store'
                });
            }

            // Only owners and managers can update payment status
            if (!['owner', 'manager'].includes(storeAccess.rows[0].role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only owners and managers can update payment status'
                });
            }

            // Start transaction
            await database.query('BEGIN');

            // Check if payment exists
            const existingPayment = await database.query(
                `SELECT * FROM staff_payments WHERE id = $1 AND store_id = $2`,
                [paymentId, storeId]
            );

            if (existingPayment.rows.length === 0) {
                await database.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    message: 'Staff payment not found'
                });
            }

            // Build update fields
            const updateFields = ['payment_status = $1', 'updated_at = $2'];
            const updateValues = [paymentStatus, new Date()];
            let paramCount = 2;

            if (paymentMethod) {
                paramCount++;
                updateFields.push(`payment_method = $${paramCount}`);
                updateValues.push(paymentMethod);
            }

            if (paymentReference) {
                paramCount++;
                updateFields.push(`payment_reference = $${paramCount}`);
                updateValues.push(paymentReference);
            }

            if (paymentDate) {
                paramCount++;
                updateFields.push(`payment_date = $${paramCount}`);
                updateValues.push(paymentDate);
            }

            if (notes) {
                paramCount++;
                updateFields.push(`notes = $${paramCount}`);
                updateValues.push(notes);
            }

            // Add WHERE conditions
            paramCount++;
            updateValues.push(paymentId);
            paramCount++;
            updateValues.push(storeId);

            const updateQuery = `
                UPDATE staff_payments 
                SET ${updateFields.join(', ')} 
                WHERE id = $${paramCount - 1} AND store_id = $${paramCount}
                RETURNING *
            `;

            const result = await database.query(updateQuery, updateValues);

            // Log activity
            await database.query(
                `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at) 
                 VALUES ($1, 'STAFF_PAYMENT_STATUS_UPDATED', 'staff_payment', $2, $3, CURRENT_TIMESTAMP)`,
                [
                    userId,
                    paymentId,
                    JSON.stringify({
                        newStatus: paymentStatus,
                        paymentMethod,
                        paymentReference,
                        storeId
                    })
                ]
            );

            // Commit transaction
            await database.query('COMMIT');

            const updatedPayment = result.rows[0];

            res.json({
                success: true,
                message: 'Payment status updated successfully',
                data: {
                    payment: {
                        id: updatedPayment.id,
                        paymentStatus: updatedPayment.payment_status,
                        paymentMethod: updatedPayment.payment_method,
                        paymentReference: updatedPayment.payment_reference,
                        paymentDate: updatedPayment.payment_date,
                        notes: updatedPayment.notes,
                        updatedAt: updatedPayment.updated_at
                    }
                }
            });

        } catch (error) {
            await database.query('ROLLBACK');
            console.error('Error updating payment status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update payment status'
            });
        }
    }
);

module.exports = router;
