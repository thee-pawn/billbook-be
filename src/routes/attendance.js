const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { validate, validateParams } = require('../middleware/validation');
const database = require('../config/database');
const {
    punchInSchema,
    punchOutSchema,
    requestLeaveSchema,
    approveLeaveSchema,
    attendanceStatusSchema,
    storeIdSchema,
    staffIdSchema
} = require('../utils/attendanceValidation');

/**
 * Punch In API
 * POST /api/attendance/:storeId/punch-in
 */
router.post('/:storeId/punch-in',
    authenticateToken,
    validateParams(storeIdSchema),
    validate(punchInSchema),
    async (req, res) => {
        try {
            const { storeId } = req.params;
            const { staffId } = req.body;
            const userId = req.user.id;
            const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const currentTime = new Date().toTimeString().split(' ')[0]; // HH:MM:SS

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

            // Verify staff belongs to this store
            const staffCheck = await database.query(
                'SELECT id FROM staff WHERE id = $1 AND store_id = $2',
                [staffId, storeId]
            );

            if (staffCheck.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Staff member not found in this store'
                });
            }

            // Check if already punched in today
            const existingAttendance = await database.query(
                'SELECT id, punch_in_time, status FROM staff_attendance WHERE staff_id = $1 AND date = $2',
                [staffId, currentDate]
            );

            if (existingAttendance.rows.length > 0 && existingAttendance.rows[0].punch_in_time) {
                return res.status(400).json({
                    success: false,
                    message: 'Staff member has already punched in today',
                    punchInTime: existingAttendance.rows[0].punch_in_time
                });
            }

            let attendanceRecord;

            if (existingAttendance.rows.length > 0) {
                // Update existing record
                const updateResult = await database.query(
                    `UPDATE staff_attendance 
                     SET punch_in_time = $1, status = 'present', updated_at = CURRENT_TIMESTAMP 
                     WHERE staff_id = $2 AND date = $3 
                     RETURNING *`,
                    [currentTime, staffId, currentDate]
                );
                attendanceRecord = updateResult.rows[0];
            } else {
                // Create new record
                const insertResult = await database.query(
                    `INSERT INTO staff_attendance (staff_id, date, punch_in_time, status) 
                     VALUES ($1, $2, $3, 'present') 
                     RETURNING *`,
                    [staffId, currentDate, currentTime]
                );
                attendanceRecord = insertResult.rows[0];
            }

            res.status(200).json({
                success: true,
                message: 'Punch in recorded successfully',
                attendance: {
                    id: attendanceRecord.id,
                    staffId: attendanceRecord.staff_id,
                    date: attendanceRecord.date,
                    punchInTime: attendanceRecord.punch_in_time,
                    status: attendanceRecord.status
                }
            });

        } catch (error) {
            console.error('Error recording punch in:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to record punch in'
            });
        }
    }
);

/**
 * Punch Out API
 * POST /api/attendance/:storeId/punch-out
 */
router.post('/:storeId/punch-out',
    authenticateToken,
    validateParams(storeIdSchema),
    validate(punchOutSchema),
    async (req, res) => {
        try {
            const { storeId } = req.params;
            const { staffId } = req.body;
            const userId = req.user.id;
            const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const currentTime = new Date().toTimeString().split(' ')[0]; // HH:MM:SS

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

            // Verify staff belongs to this store
            const staffCheck = await database.query(
                'SELECT id FROM staff WHERE id = $1 AND store_id = $2',
                [staffId, storeId]
            );

            if (staffCheck.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Staff member not found in this store'
                });
            }

            // Check if punched in today
            const attendanceCheck = await database.query(
                'SELECT id, punch_in_time, punch_out_time FROM staff_attendance WHERE staff_id = $1 AND date = $2',
                [staffId, currentDate]
            );

            if (attendanceCheck.rows.length === 0 || !attendanceCheck.rows[0].punch_in_time) {
                return res.status(400).json({
                    success: false,
                    message: 'Staff member has not punched in today'
                });
            }

            if (attendanceCheck.rows[0].punch_out_time) {
                return res.status(400).json({
                    success: false,
                    message: 'Staff member has already punched out today',
                    punchOutTime: attendanceCheck.rows[0].punch_out_time
                });
            }

            // Update punch out time
            const updateResult = await database.query(
                `UPDATE staff_attendance 
                 SET punch_out_time = $1, updated_at = CURRENT_TIMESTAMP 
                 WHERE staff_id = $2 AND date = $3 
                 RETURNING *`,
                [currentTime, staffId, currentDate]
            );

            const attendanceRecord = updateResult.rows[0];

            res.status(200).json({
                success: true,
                message: 'Punch out recorded successfully',
                attendance: {
                    id: attendanceRecord.id,
                    staffId: attendanceRecord.staff_id,
                    date: attendanceRecord.date,
                    punchInTime: attendanceRecord.punch_in_time,
                    punchOutTime: attendanceRecord.punch_out_time,
                    status: attendanceRecord.status
                }
            });

        } catch (error) {
            console.error('Error recording punch out:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to record punch out'
            });
        }
    }
);

/**
 * Request Leave API
 * POST /api/attendance/:storeId/request-leave
 */
router.post('/:storeId/request-leave',
    authenticateToken,
    validateParams(storeIdSchema),
    validate(requestLeaveSchema),
    async (req, res) => {
        try {
            const { storeId } = req.params;
            const { staffId, date, leaveType, leaveReason } = req.body;
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

            // Verify staff belongs to this store
            const staffCheck = await database.query(
                'SELECT id FROM staff WHERE id = $1 AND store_id = $2',
                [staffId, storeId]
            );

            if (staffCheck.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Staff member not found in this store'
                });
            }

            // Check if leave already exists for this date
            const existingLeave = await database.query(
                'SELECT id, status FROM staff_attendance WHERE staff_id = $1 AND date = $2',
                [staffId, date]
            );

            if (existingLeave.rows.length > 0) {
                const currentStatus = existingLeave.rows[0].status;
                if (['leave_requested', 'leave_approved', 'leave'].includes(currentStatus)) {
                    return res.status(400).json({
                        success: false,
                        message: `Leave already ${currentStatus.replace('_', ' ')} for this date`
                    });
                }
            }

            let leaveRecord;

            if (existingLeave.rows.length > 0) {
                // Update existing record
                const updateResult = await database.query(
                    `UPDATE staff_attendance 
                     SET status = 'leave_requested', leave_type = $1, leave_reason = $2, 
                         punch_in_time = NULL, punch_out_time = NULL, updated_at = CURRENT_TIMESTAMP 
                     WHERE staff_id = $3 AND date = $4 
                     RETURNING *`,
                    [leaveType, leaveReason, staffId, date]
                );
                leaveRecord = updateResult.rows[0];
            } else {
                // Create new record
                const insertResult = await database.query(
                    `INSERT INTO staff_attendance (staff_id, date, status, leave_type, leave_reason) 
                     VALUES ($1, $2, 'leave_requested', $3, $4) 
                     RETURNING *`,
                    [staffId, date, leaveType, leaveReason]
                );
                leaveRecord = insertResult.rows[0];
            }

            res.status(200).json({
                success: true,
                message: 'Leave request submitted successfully',
                leaveRequest: {
                    id: leaveRecord.id,
                    staffId: leaveRecord.staff_id,
                    date: leaveRecord.date,
                    status: leaveRecord.status,
                    leaveType: leaveRecord.leave_type,
                    leaveReason: leaveRecord.leave_reason
                }
            });

        } catch (error) {
            console.error('Error requesting leave:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to request leave'
            });
        }
    }
);

/**
 * Approve/Reject Leave API
 * POST /api/attendance/:storeId/approve-leave
 */
router.post('/:storeId/approve-leave',
    authenticateToken,
    validateParams(storeIdSchema),
    validate(approveLeaveSchema),
    async (req, res) => {
        try {
            const { storeId } = req.params;
            const { staffId, date, approved } = req.body;
            const userId = req.user.id;

            // Check if user has access to this store and appropriate role
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

            // Only managers and owners can approve leaves
            if (!['owner', 'manager'].includes(storeAccess.rows[0].role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only owners and managers can approve leaves'
                });
            }

            // Verify staff belongs to this store
            const staffCheck = await database.query(
                'SELECT id FROM staff WHERE id = $1 AND store_id = $2',
                [staffId, storeId]
            );

            if (staffCheck.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Staff member not found in this store'
                });
            }

            // Check if leave request exists
            const leaveCheck = await database.query(
                'SELECT id, status FROM staff_attendance WHERE staff_id = $1 AND date = $2 AND status = $3',
                [staffId, date, 'leave_requested']
            );

            if (leaveCheck.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No pending leave request found for this date'
                });
            }

            // Get approver staff ID
            const approverStaff = await database.query(
                'SELECT id FROM staff WHERE user_id = $1 AND store_id = $2',
                [userId, storeId]
            );

            const approverStaffId = approverStaff.rows.length > 0 ? approverStaff.rows[0].id : null;

            // Update leave status
            const newStatus = approved ? 'leave_approved' : 'absent';
            const updateResult = await database.query(
                `UPDATE staff_attendance 
                 SET status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
                 WHERE staff_id = $3 AND date = $4 
                 RETURNING *`,
                [newStatus, approverStaffId, staffId, date]
            );

            const leaveRecord = updateResult.rows[0];

            res.status(200).json({
                success: true,
                message: `Leave ${approved ? 'approved' : 'rejected'} successfully`,
                leaveRecord: {
                    id: leaveRecord.id,
                    staffId: leaveRecord.staff_id,
                    date: leaveRecord.date,
                    status: leaveRecord.status,
                    leaveType: leaveRecord.leave_type,
                    leaveReason: leaveRecord.leave_reason,
                    approvedBy: leaveRecord.approved_by,
                    approvedAt: leaveRecord.approved_at
                }
            });

        } catch (error) {
            console.error('Error approving leave:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process leave approval'
            });
        }
    }
);

/**
 * Get Attendance Status API
 * GET /api/attendance/:storeId/status/:staffId
 * Query params: date (optional), startDate & endDate (optional for range)
 */
router.get('/:storeId/status/:staffId',
    authenticateToken,
    validateParams(storeIdSchema),
    validateParams(staffIdSchema),
    async (req, res) => {
        try {
            const { storeId, staffId } = req.params;
            const { date, startDate, endDate } = req.query;
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

            // Verify staff belongs to this store
            const staffCheck = await database.query(
                'SELECT id, name FROM staff WHERE id = $1 AND store_id = $2',
                [staffId, storeId]
            );

            if (staffCheck.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Staff member not found in this store'
                });
            }

            let query;
            let params;

            if (date) {
                // Single date query
                query = `
                    SELECT * FROM staff_attendance 
                    WHERE staff_id = $1 AND date = $2 
                    ORDER BY date DESC
                `;
                params = [staffId, date];
            } else if (startDate && endDate) {
                // Date range query
                query = `
                    SELECT * FROM staff_attendance 
                    WHERE staff_id = $1 AND date BETWEEN $2 AND $3 
                    ORDER BY date DESC
                `;
                params = [staffId, startDate, endDate];
            } else {
                // Current date if no date specified
                const currentDate = new Date().toISOString().split('T')[0];
                query = `
                    SELECT * FROM staff_attendance 
                    WHERE staff_id = $1 AND date = $2 
                    ORDER BY date DESC
                `;
                params = [staffId, currentDate];
            }

            const attendanceResult = await database.query(query, params);

            const attendanceRecords = attendanceResult.rows.map(record => ({
                id: record.id,
                staffId: record.staff_id,
                date: record.date,
                status: record.status,
                punchInTime: record.punch_in_time,
                punchOutTime: record.punch_out_time,
                leaveType: record.leave_type,
                leaveReason: record.leave_reason,
                approvedBy: record.approved_by,
                approvedAt: record.approved_at,
                createdAt: record.created_at,
                updatedAt: record.updated_at
            }));

            res.status(200).json({
                success: true,
                data: {
                    staff: {
                        id: staffCheck.rows[0].id,
                        name: staffCheck.rows[0].name
                    },
                    attendance: attendanceRecords
                }
            });

        } catch (error) {
            console.error('Error fetching attendance status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch attendance status'
            });
        }
    }
);

module.exports = router;
