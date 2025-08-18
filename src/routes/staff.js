const express = require('express');
const router = express.Router();
const database = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validate, validateParams } = require('../middleware/validation');
const { 
    createStaffSchema, 
    updateStaffSchema, 
    storeIdSchema, 
    staffIdSchema,
    storeStaffIdSchema 
} = require('../utils/staffValidation');

/**
 * Create a new staff member
 * POST /api/staff/:storeId
 */
router.post('/:storeId', 
    authenticateToken,
    validateParams(storeIdSchema),
    validate(createStaffSchema),
    async (req, res) => {
        try {
            const { storeId } = req.params;
            const userId = req.user.id;
            console.log('DEBUG: req.user:', req.user);
            console.log('DEBUG: storeId:', storeId);
            const {
                name,
                contact,
                gender,
                email,
                doj,
                dob,
                designation,
                role,
                shifts,
                documentId,
                photoId,
                salary,
                commission,
                accountNumber,
                ifscCode,
                bankingName,
                bankName
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

            // Only owners and managers can create staff
            if (!['owner', 'manager'].includes(storeAccess.rows[0].role)) {
                return res.status(403).json({ 
                    success: false,
                    message: 'Access denied. Only owners and managers can create staff members.' 
                });
            }

            // Start transaction
            await database.query('BEGIN');

            // Check if contact already exists for this store
            const existingContact = await database.query(
                'SELECT id FROM staff WHERE contact = $1 AND store_id = $2 AND status != $3',
                [contact, storeId, 'terminated']
            );

            if (existingContact.rows.length > 0) {
                await database.query('ROLLBACK');
                return res.status(400).json({ 
                    error: 'A staff member with this contact number already exists in this store.' 
                });
            }

            // Check if email already exists (if provided)
            if (email) {
                const existingEmail = await database.query(
                    'SELECT id FROM staff WHERE email = $1 AND store_id = $2 AND status != $3',
                    [email, storeId, 'terminated']
                );

                if (existingEmail.rows.length > 0) {
                    await database.query('ROLLBACK');
                    return res.status(400).json({ 
                        error: 'A staff member with this email already exists in this store.' 
                    });
                }
            }

            // Create user account for staff member
            const userResult = await database.query(
                `INSERT INTO users (name, phone_number, email, password, status, created_at, updated_at) 
                 VALUES ($1, $2, $3, $4, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
                 RETURNING id`,
                [name, contact, email, 'defaultPassword123'] // Using a default password for staff accounts
            );

            const newUserId = userResult.rows[0].id;

            // Create staff record
            const staffResult = await database.query(
                `INSERT INTO staff (
                    user_id, store_id, name, contact, gender, email, doj, dob, 
                    designation, role, shifts, document_id, photo_id, salary, commission,
                    account_number, ifsc_code, banking_name, bank_name,
                    created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 
                         $16, $17, $18, $19, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
                 RETURNING *`,
                [
                    newUserId, storeId, name, contact, gender, email, doj, dob,
                    designation, role, JSON.stringify(shifts), documentId, photoId,
                    JSON.stringify(salary), commission ? JSON.stringify(commission) : null,
                    accountNumber, ifscCode, bankingName, bankName
                ]
            );

            // Commit transaction
            await database.query('COMMIT');

            const staff = staffResult.rows[0];
            
            res.status(201).json({
                message: 'Staff member created successfully',
                staff: {
                    id: staff.id,
                    userId: staff.user_id,
                    storeId: staff.store_id,
                    name: staff.name,
                    contact: staff.contact,
                    gender: staff.gender,
                    email: staff.email,
                    doj: staff.doj,
                    dob: staff.dob,
                    designation: staff.designation,
                    role: staff.role,
                    shifts: staff.shifts,
                    documentId: staff.document_id,
                    photoId: staff.photo_id,
                    salary: staff.salary,
                    commission: staff.commission,
                    status: staff.status,
                    createdAt: staff.created_at,
                    updatedAt: staff.updated_at
                }
            });

        } catch (error) {
            await database.query('ROLLBACK');
            console.error('Error creating staff:', error);
            res.status(500).json({ error: 'Failed to create staff member' });
        }
    }
);

/**
 * Get all staff members for a store
 * GET /api/staff/:storeId
 */
router.get('/:storeId',
    authenticateToken,
    validateParams(storeIdSchema),
    async (req, res) => {
        try {
            const { storeId } = req.params;
            const userId = req.user.id;
            const { status, page = 1, limit = 10 } = req.query;

            // Check if user has access to this store
            const storeAccess = await database.query(
                `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
                [storeId, userId]
            );

            if (storeAccess.rows.length === 0) {
                return res.status(403).json({ 
                    error: 'Access denied. You do not have permission to access this store.' 
                });
            }

            // Build query conditions
            let queryConditions = 'WHERE s.store_id = $1';
            let queryParams = [storeId];
            let paramCount = 1;

            if (status) {
                paramCount++;
                queryConditions += ` AND s.status = $${paramCount}`;
                queryParams.push(status);
            }

            // Calculate offset for pagination
            const offset = (page - 1) * limit;

            // Get total count
            const countResult = await database.query(
                `SELECT COUNT(*) as total FROM staff s ${queryConditions}`,
                queryParams
            );

            const totalStaff = parseInt(countResult.rows[0].total);

            // Get staff members with pagination
            const staffResult = await database.query(
                `SELECT s.*, u.status as user_status 
                 FROM staff s
                 LEFT JOIN users u ON s.user_id = u.id
                 ${queryConditions}
                 ORDER BY s.created_at DESC
                 LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
                [...queryParams, limit, offset]
            );

            const staff = staffResult.rows.map(member => ({
                id: member.id,
                userId: member.user_id,
                storeId: member.store_id,
                name: member.name,
                contact: member.contact,
                gender: member.gender,
                email: member.email,
                doj: member.doj,
                dob: member.dob,
                designation: member.designation,
                role: member.role,
                shifts: member.shifts,
                documentId: member.document_id,
                photoId: member.photo_id,
                salary: member.salary,
                commission: member.commission,
                accountNumber: member.account_number,
                ifscCode: member.ifsc_code,
                bankingName: member.banking_name,
                bankName: member.bank_name,
                status: member.status,
                userStatus: member.user_status,
                createdAt: member.created_at,
                updatedAt: member.updated_at
            }));

            res.json({
                staff,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalStaff / limit),
                    totalStaff,
                    hasNextPage: parseInt(page) < Math.ceil(totalStaff / limit),
                    hasPreviousPage: parseInt(page) > 1
                }
            });

        } catch (error) {
            console.error('Error fetching staff:', error);
            res.status(500).json({ error: 'Failed to fetch staff members' });
        }
    }
);

/**
 * Get staff statistics for a store
 * GET /api/staff/:storeId/statistics
 */
router.get('/:storeId/statistics',
    authenticateToken,
    validateParams(storeIdSchema),
    async (req, res) => {
        try {
            const { storeId } = req.params;
            const userId = req.user.id;

            // Check if user has access to this store
            const storeAccess = await database.query(
                `SELECT su.role FROM store_users su 
                 WHERE su.user_id = $1 AND su.store_id = $2`,
                [storeId, userId]
            );

            if (storeAccess.rows.length === 0) {
                return res.status(403).json({ 
                    error: 'Access denied. You do not have permission to access this store.' 
                });
            }

            // Get staff statistics
            const statsResult = await database.query(
                `SELECT 
                    COUNT(*) as total_staff,
                    COUNT(*) FILTER (WHERE status = 'active') as active_staff,
                    COUNT(*) FILTER (WHERE status = 'inactive') as inactive_staff,
                    COUNT(*) FILTER (WHERE status = 'terminated') as terminated_staff,
                    COUNT(DISTINCT designation) as total_designations,
                    COUNT(DISTINCT role) as total_roles
                 FROM staff 
                 WHERE store_id = $1`,
                [storeId]
            );

            const stats = statsResult.rows[0];

            res.json({
                storeId,
                totalStaff: parseInt(stats.total_staff),
                activeStaff: parseInt(stats.active_staff),
                inactiveStaff: parseInt(stats.inactive_staff),
                terminatedStaff: parseInt(stats.terminated_staff),
                totalDesignations: parseInt(stats.total_designations),
                totalRoles: parseInt(stats.total_roles)
            });

        } catch (error) {
            console.error('Error fetching staff statistics:', error);
            res.status(500).json({ error: 'Failed to fetch staff statistics' });
        }
    }
);

/**
 * Get a specific staff member by ID
 * GET /api/staff/:storeId/:staffId
 */
router.get('/:storeId/:staffId',
    authenticateToken,
    validateParams(storeStaffIdSchema),
    async (req, res) => {
        try {
            const { storeId, staffId } = req.params;
            const userId = req.user.id;

            // Check if user has access to this store
            const storeAccess = await database.query(
                `SELECT su.role FROM store_users su 
                 WHERE su.user_id = $1 AND su.store_id = $2`,
                [storeId, userId]
            );

            if (storeAccess.rows.length === 0) {
                return res.status(403).json({ 
                    error: 'Access denied. You do not have permission to access this store.' 
                });
            }

            // Get staff member
            const staffResult = await database.query(
                `SELECT s.*, u.status as user_status 
                 FROM staff s
                 LEFT JOIN users u ON s.user_id = u.id
                 WHERE s.id = $1 AND s.store_id = $2`,
                [staffId, storeId]
            );

            if (staffResult.rows.length === 0) {
                return res.status(404).json({ error: 'Staff member not found' });
            }

            const staff = staffResult.rows[0];

            res.json({
                staff: {
                    id: staff.id,
                    userId: staff.user_id,
                    storeId: staff.store_id,
                    name: staff.name,
                    contact: staff.contact,
                    gender: staff.gender,
                    email: staff.email,
                    doj: staff.doj,
                    dob: staff.dob,
                    designation: staff.designation,
                    role: staff.role,
                    shifts: staff.shifts,
                    documentId: staff.document_id,
                    photoId: staff.photo_id,
                    salary: staff.salary,
                    commission: staff.commission,
                    accountNumber: staff.account_number,
                    ifscCode: staff.ifsc_code,
                    bankingName: staff.banking_name,
                    bankName: staff.bank_name,
                    status: staff.status,
                    userStatus: staff.user_status,
                    createdAt: staff.created_at,
                    updatedAt: staff.updated_at
                }
            });

        } catch (error) {
            console.error('Error fetching staff member:', error);
            res.status(500).json({ error: 'Failed to fetch staff member' });
        }
    }
);

/**
 * Update a staff member
 * PUT /api/staff/:storeId/:staffId
 */
router.put('/:storeId/:staffId',
    authenticateToken,
    validateParams(storeStaffIdSchema),
    validate(updateStaffSchema),
    async (req, res) => {
        try {
            const { storeId, staffId } = req.params;
            const userId = req.user.id;
            const updates = req.body;

            // Check if user has access to this store
            const storeAccess = await database.query(
                `SELECT su.role FROM store_users su 
                 WHERE su.user_id = $1 AND su.store_id = $2`,
                [storeId, userId]
            );

            if (storeAccess.rows.length === 0) {
                return res.status(403).json({ 
                    error: 'Access denied. You do not have permission to manage this store.' 
                });
            }

            // Only owners and managers can update staff
            if (!['owner', 'manager'].includes(storeAccess.rows[0].role)) {
                return res.status(403).json({ 
                    error: 'Access denied. Only owners and managers can update staff members.' 
                });
            }

            // Check if staff member exists
            const existingStaff = await database.query(
                'SELECT * FROM staff WHERE id = $1 AND store_id = $2',
                [staffId, storeId]
            );

            if (existingStaff.rows.length === 0) {
                return res.status(404).json({ error: 'Staff member not found' });
            }

            const currentStaff = existingStaff.rows[0];

            // Start transaction
            await database.query('BEGIN');

            // Check for contact conflicts (if contact is being updated)
            if (updates.contact && updates.contact !== currentStaff.contact) {
                const contactConflict = await database.query(
                    'SELECT id FROM staff WHERE contact = $1 AND store_id = $2 AND id != $3 AND status != $4',
                    [updates.contact, storeId, staffId, 'terminated']
                );

                if (contactConflict.rows.length > 0) {
                    await database.query('ROLLBACK');
                    return res.status(400).json({ 
                        error: 'A staff member with this contact number already exists in this store.' 
                    });
                }
            }

            // Check for email conflicts (if email is being updated)
            if (updates.email && updates.email !== currentStaff.email) {
                const emailConflict = await database.query(
                    'SELECT id FROM staff WHERE email = $1 AND store_id = $2 AND id != $3 AND status != $4',
                    [updates.email, storeId, staffId, 'terminated']
                );

                if (emailConflict.rows.length > 0) {
                    await database.query('ROLLBACK');
                    return res.status(400).json({ 
                        error: 'A staff member with this email already exists in this store.' 
                    });
                }
            }

            // Build update query dynamically
            const updateFields = [];
            const updateValues = [];
            let paramCount = 0;

            const fieldMapping = {
                name: 'name',
                contact: 'contact',
                gender: 'gender',
                email: 'email',
                doj: 'doj',
                dob: 'dob',
                designation: 'designation',
                role: 'role',
                shifts: 'shifts',
                documentId: 'document_id',
                photoId: 'photo_id',
                salary: 'salary',
                commission: 'commission',
                status: 'status',
                accountNumber: 'account_number',
                ifscCode: 'ifsc_code',
                bankingName: 'banking_name',
                bankName: 'bank_name'
            };

            for (const [key, value] of Object.entries(updates)) {
                if (fieldMapping[key]) {
                    paramCount++;
                    updateFields.push(`${fieldMapping[key]} = $${paramCount}`);
                    
                    // Handle JSON fields
                    if (['shifts', 'salary', 'commission'].includes(key)) {
                        updateValues.push(value ? JSON.stringify(value) : null);
                    } else {
                        updateValues.push(value);
                    }
                }
            }

            if (updateFields.length === 0) {
                await database.query('ROLLBACK');
                return res.status(400).json({ error: 'No valid fields to update' });
            }

            // Add updated_at field
            paramCount++;
            updateFields.push(`updated_at = $${paramCount}`);
            updateValues.push(new Date());

            // Add WHERE conditions
            paramCount++;
            updateValues.push(staffId);
            paramCount++;
            updateValues.push(storeId);

            const updateQuery = `
                UPDATE staff 
                SET ${updateFields.join(', ')} 
                WHERE id = $${paramCount - 1} AND store_id = $${paramCount}
                RETURNING *
            `;

            const result = await database.query(updateQuery, updateValues);

            // Update user table if contact or email changed
            if (updates.contact || updates.email) {
                const userUpdates = [];
                const userValues = [];
                let userParamCount = 0;

                if (updates.contact) {
                    userParamCount++;
                    userUpdates.push(`contact = $${userParamCount}`);
                    userValues.push(updates.contact);
                }

                if (updates.email) {
                    userParamCount++;
                    userUpdates.push(`email = $${userParamCount}`);
                    userValues.push(updates.email);
                }

                if (userUpdates.length > 0) {
                    userParamCount++;
                    userUpdates.push(`updated_at = $${userParamCount}`);
                    userValues.push(new Date());

                    userParamCount++;
                    userValues.push(currentStaff.user_id);

                    const userUpdateQuery = `
                        UPDATE users 
                        SET ${userUpdates.join(', ')} 
                        WHERE id = $${userParamCount}
                    `;

                    await database.query(userUpdateQuery, userValues);
                }
            }

            // Commit transaction
            await database.query('COMMIT');

            const updatedStaff = result.rows[0];

            res.json({
                message: 'Staff member updated successfully',
                staff: {
                    id: updatedStaff.id,
                    userId: updatedStaff.user_id,
                    storeId: updatedStaff.store_id,
                    name: updatedStaff.name,
                    contact: updatedStaff.contact,
                    gender: updatedStaff.gender,
                    email: updatedStaff.email,
                    doj: updatedStaff.doj,
                    dob: updatedStaff.dob,
                    designation: updatedStaff.designation,
                    role: updatedStaff.role,
                    shifts: updatedStaff.shifts,
                    documentId: updatedStaff.document_id,
                    photoId: updatedStaff.photo_id,
                    salary: updatedStaff.salary,
                    commission: updatedStaff.commission,
                    accountNumber: updatedStaff.account_number,
                    ifscCode: updatedStaff.ifsc_code,
                    bankingName: updatedStaff.banking_name,
                    bankName: updatedStaff.bank_name,
                    status: updatedStaff.status,
                    createdAt: updatedStaff.created_at,
                    updatedAt: updatedStaff.updated_at
                }
            });

        } catch (error) {
            await database.query('ROLLBACK');
            console.error('Error updating staff:', error);
            res.status(500).json({ error: 'Failed to update staff member' });
        }
    }
);

module.exports = router;
