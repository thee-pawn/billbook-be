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
    storeStaffIdSchema,
    storeServiceIdSchema 
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
            const body = req.body;
            const isNested = !!body.personal && !!body.employment; // previous nested format
            const isExternal = !!body.personal && !!body.role; // new external format
            let name, contact, gender, email, doj, dob, designation, role, shifts, services, documentId, photoId, salary, commission, accountNumber, ifscCode, bankingName, bankName;
            if (isExternal) {
                const p = body.personal;
                name = p.name;
                contact = p.phone;
                gender = (p.gender || '').toLowerCase();
                email = p.email;
                doj = p.dateOfJoining;
                dob = p.dateOfBirth;
                const r = body.role;
                designation = r.designation;
                role = r.role;
                services = r.services || [];// names
                // Transform day-based shifts -> summary object (active days & uniform hours if consistent)
                const activeDays = (r.shifts || []).filter(d => d.active);
                let workingHoursStart = null;
                let workingHoursEnd = null;
                if (activeDays.length) {
                    workingHoursStart = activeDays[0].startTime;
                    workingHoursEnd = activeDays[0].endTime;
                    // If hours vary, fallback to earliest start / latest end
                    const starts = activeDays.map(d => d.startTime).sort();
                    const ends = activeDays.map(d => d.endTime).sort();
                    if (new Set(starts).size > 1) workingHoursStart = starts[0];
                    if (new Set(ends).size > 1) workingHoursEnd = ends[ends.length -1];
                }
                shifts = {
                    workingDays: activeDays.map(d => d.day.toLowerCase()),
                    workingHoursStart: workingHoursStart || '09:00',
                    workingHoursEnd: workingHoursEnd || '18:00'
                };
                // Documents (not provided except documentName placeholder)
                documentId = p.documentName || null;
                photoId = null;
                // Salary mapping
                const s = body.salary;
                if (s) {
                    const earnings = { basic: 0, hra: 0, otherAllowances: 0 };
                    (s.earnings || []).forEach(e => {
                        const n = (e.name || '').toLowerCase();
                        if (n === 'basic') earnings.basic += e.amount;
                        else if (n === 'hra') earnings.hra += e.amount;
                        else earnings.otherAllowances += e.amount;
                    });
                    const deductions = { professionalTax: 0, epf: 0 };
                    (s.deductions || []).forEach(d => {
                        const n = (d.name || '').toLowerCase();
                        if (n.includes('tax')) deductions.professionalTax += d.amount;
                        else if (n === 'epf') deductions.epf += d.amount;
                    });
                    salary = { earnings, deductions };
                }
                // Commission mapping
                const c = body.commission;
                if (c) {
                    commission = {
                        commissionType: (c.type || 'percentage').toLowerCase(),
                        commissionCycle: (c.bracketPeriod || 'monthly').toLowerCase(),
                        commissionRates: (c.slabs || []).map(sl => ({
                            type: (sl.basis || 'services').toLowerCase(),
                            commissionType: (c.type || 'percentage').toLowerCase(),
                            minRevenue: sl.from,
                            maxRevenue: sl.to,
                            commission: sl.value
                        }))
                    };
                }
                const b = body.bank || {};
                accountNumber = b.accountNumber;
                ifscCode = b.ifsc; // may be non-standard; we relax validation in external schema
                bankingName = b.accountName;
                bankName = b.bankName;
            } else if (isNested) {
                name = body.personal.name;
                contact = body.personal.contact;
                gender = body.personal.gender;
                email = body.personal.email;
                doj = body.personal.doj;
                dob = body.personal.dob;
                designation = body.employment.designation;
                role = body.employment.role;
                shifts = body.employment.shifts;
                services = body.employment.services || [];
                documentId = body.documents ? body.documents.documentId : null;
                photoId = body.documents ? body.documents.photoId : null;
                salary = body.compensation.salary;
                commission = body.compensation.commission;
                accountNumber = body.banking ? body.banking.accountNumber : null;
                ifscCode = body.banking ? body.banking.ifscCode : null;
                bankingName = body.banking ? body.banking.bankingName : null;
                bankName = body.banking ? body.banking.bankName : null;
            } else {
                // legacy flat
                ({ name, contact, gender, email, doj, dob, designation, role, shifts, documentId, photoId, salary, commission, accountNumber, ifscCode, bankingName, bankName } = body);
                services = body.services || [];
            }

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

            // Insert staff-services mappings if provided
            if (services && services.length) {
                let serviceIds = services;
                if (isExternal) {
                    // Map names -> ids
                    const svcLookup = await database.query(
                        'SELECT id, name FROM services WHERE store_id = $1 AND name = ANY($2)',
                        [storeId, services]
                    );
                    const nameToId = {};
                    svcLookup.rows.forEach(r => { nameToId[r.name] = r.id; });
                    const missingNames = services.filter(n => !nameToId[n]);
                    if (missingNames.length) {
                        await database.query('ROLLBACK');
                        return res.status(400).json({ error: 'Some services not found for this store', missing: missingNames });
                    }
                    serviceIds = services.map(n => nameToId[n]);
                } else {
                    // Validate IDs belong to store
                    const serviceCheck = await database.query(
                        'SELECT id FROM services WHERE id = ANY($1) AND store_id = $2',
                        [serviceIds, storeId]
                    );
                    const foundServiceIds = serviceCheck.rows.map(r => r.id);
                    const missing = serviceIds.filter(id => !foundServiceIds.includes(id));
                    if (missing.length) {
                        await database.query('ROLLBACK');
                        return res.status(400).json({ error: 'Some services not found for this store', missing });
                    }
                }
                const newStaffId = staffResult.rows[0].id;
                for (const svcId of serviceIds) {
                    await database.query(
                        `INSERT INTO staff_services (staff_id, service_id, store_id) VALUES ($1, $2, $3)
                         ON CONFLICT (staff_id, service_id) DO NOTHING`,
                        [newStaffId, svcId, storeId]
                    );
                }
            }

            // Commit transaction
            await database.query('COMMIT');

            const staff = staffResult.rows[0];

            // Service names for external format
            let serviceNames = [];
            if (services && services.length) {
                const svcNameRows = await database.query(
                    `SELECT sv.name FROM staff_services ss JOIN services sv ON sv.id = ss.service_id WHERE ss.staff_id = $1` ,
                    [staff.id]
                );
                serviceNames = svcNameRows.rows.map(r => r.name);
            }

            // Build day shifts from summary
            const shiftObj = staff.shifts || {};
            const daysOrder = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
            const dayShifts = daysOrder.map(d => ({
                day: d.charAt(0).toUpperCase() + d.slice(1),
                active: Array.isArray(shiftObj.workingDays) ? shiftObj.workingDays.includes(d) : false,
                startTime: shiftObj.workingHoursStart || '09:00',
                endTime: shiftObj.workingHoursEnd || '18:00'
            }));
            const sal = staff.salary || { earnings: {}, deductions: {} };
            const earningsArr = [];
            if (sal.earnings) {
                if (sal.earnings.basic != null) earningsArr.push({ name: 'Basic', amount: Number(sal.earnings.basic) });
                if (sal.earnings.hra != null) earningsArr.push({ name: 'HRA', amount: Number(sal.earnings.hra) });
                if (sal.earnings.otherAllowances != null && sal.earnings.otherAllowances !== 0) earningsArr.push({ name: 'Other Allowances', amount: Number(sal.earnings.otherAllowances) });
            }
            const deductionsArr = [];
            if (sal.deductions) {
                if (sal.deductions.professionalTax != null && sal.deductions.professionalTax !== 0) deductionsArr.push({ name: 'Professional Tax', amount: Number(sal.deductions.professionalTax) });
                if (sal.deductions.epf != null && sal.deductions.epf !== 0) deductionsArr.push({ name: 'EPF', amount: Number(sal.deductions.epf) });
            }
            const totalEarnings = earningsArr.reduce((a,c)=>a+c.amount,0);
            const totalDeductions = deductionsArr.reduce((a,c)=>a+c.amount,0);
            const grossPay = totalEarnings;
            const netPay = grossPay - totalDeductions;
            const comm = staff.commission;
            let slabs = [];
            if (comm && Array.isArray(comm.commissionRates)) {
                slabs = comm.commissionRates.map(r => ({
                    from: r.minRevenue,
                    to: r.maxRevenue,
                    value: r.commission,
                    basis: r.type.charAt(0).toUpperCase() + r.type.slice(1)
                }));
            }
            res.status(201).json({
                staffId: staff.id,
                storeId: staff.store_id,
                personal: {
                    name: staff.name,
                    gender: staff.gender,
                    phone: staff.contact,
                    email: staff.email,
                    dateOfBirth: staff.dob,
                    dateOfJoining: staff.doj,
                    documentName: staff.document_id || null
                },
                role: {
                    role: staff.role,
                    designation: staff.designation,
                    services: serviceNames,
                    shifts: dayShifts
                },
                salary: {
                    type: 'Monthly',
                    cycle: '1 to 1 of Every Month',
                    earnings: earningsArr,
                    deductions: deductionsArr,
                    totals: { totalEarnings, totalDeductions, grossPay, netPay }
                },
                commission: comm ? {
                    type: comm.commissionType ? (comm.commissionType.charAt(0).toUpperCase() + comm.commissionType.slice(1)) : null,
                    bracketPeriod: comm.commissionCycle ? (comm.commissionCycle.charAt(0).toUpperCase() + comm.commissionCycle.slice(1)) : null,
                    startDate: null,
                    slabs
                } : null,
                bank: {
                    accountName: staff.banking_name,
                    accountNumber: staff.account_number,
                    ifsc: staff.ifsc_code,
                    bankName: staff.bank_name,
                    branch: null
                },
                status: staff.status
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
            const staffRows = staffResult.rows;
            let serviceNameMap = {};
            if (staffRows.length) {
                const ids = staffRows.map(r => r.id);
                const svcRes = await database.query(
                    `SELECT ss.staff_id, sv.name 
                     FROM staff_services ss 
                     JOIN services sv ON sv.id = ss.service_id 
                     WHERE ss.staff_id = ANY($1)`,
                    [ids]
                );
                serviceNameMap = svcRes.rows.reduce((acc, row) => {
                    if (!acc[row.staff_id]) acc[row.staff_id] = [];
                    acc[row.staff_id].push(row.name);
                    return acc;
                }, {});
            }

            const dayOrder = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
            const staffExternal = staffRows.map(member => {
                // Expand shifts to per-day representation
                const shiftObj = member.shifts || {};
                const workingDays = Array.isArray(shiftObj.workingDays) ? shiftObj.workingDays : [];
                const dayShifts = dayOrder.map(d => ({
                    day: d.charAt(0).toUpperCase() + d.slice(1),
                    active: workingDays.includes(d),
                    startTime: shiftObj.workingHoursStart || '09:00',
                    endTime: shiftObj.workingHoursEnd || '18:00'
                }));
                // Salary arrays
                const sal = member.salary || { earnings: {}, deductions: {} };
                const earningsArr = [];
                if (sal.earnings) {
                    if (sal.earnings.basic != null) earningsArr.push({ name: 'Basic', amount: Number(sal.earnings.basic) });
                    if (sal.earnings.hra != null) earningsArr.push({ name: 'HRA', amount: Number(sal.earnings.hra) });
                    if (sal.earnings.otherAllowances != null && sal.earnings.otherAllowances !== 0) earningsArr.push({ name: 'Other Allowances', amount: Number(sal.earnings.otherAllowances) });
                }
                const deductionsArr = [];
                if (sal.deductions) {
                    if (sal.deductions.professionalTax != null && sal.deductions.professionalTax !== 0) deductionsArr.push({ name: 'Professional Tax', amount: Number(sal.deductions.professionalTax) });
                    if (sal.deductions.epf != null && sal.deductions.epf !== 0) deductionsArr.push({ name: 'EPF', amount: Number(sal.deductions.epf) });
                }
                const totalEarnings = earningsArr.reduce((a,c)=>a+c.amount,0);
                const totalDeductions = deductionsArr.reduce((a,c)=>a+c.amount,0);
                const grossPay = totalEarnings;
                const netPay = grossPay - totalDeductions;
                const comm = member.commission;
                let slabs = [];
                if (comm && Array.isArray(comm.commissionRates)) {
                    slabs = comm.commissionRates.map(r => ({
                        from: r.minRevenue,
                        to: r.maxRevenue,
                        value: r.commission,
                        basis: r.type.charAt(0).toUpperCase() + r.type.slice(1)
                    }));
                }
                return {
                    staffId: member.id,
                    storeId: member.store_id,
                    personal: {
                        name: member.name,
                        gender: member.gender,
                        phone: member.contact,
                        email: member.email,
                        dateOfBirth: member.dob,
                        dateOfJoining: member.doj,
                        documentName: member.document_id || null
                    },
                    role: {
                        role: member.role,
                        designation: member.designation,
                        services: serviceNameMap[member.id] || [],
                        shifts: dayShifts
                    },
                    salary: {
                        type: 'Monthly',
                        cycle: '1 to 1 of Every Month',
                        earnings: earningsArr,
                        deductions: deductionsArr,
                        totals: { totalEarnings, totalDeductions, grossPay, netPay }
                    },
                    commission: comm ? {
                        type: comm.commissionType ? (comm.commissionType.charAt(0).toUpperCase() + comm.commissionType.slice(1)) : null,
                        bracketPeriod: comm.commissionCycle ? (comm.commissionCycle.charAt(0).toUpperCase() + comm.commissionCycle.slice(1)) : null,
                        startDate: null,
                        slabs
                    } : null,
                    bank: {
                        accountName: member.banking_name,
                        accountNumber: member.account_number,
                        ifsc: member.ifsc_code,
                        bankName: member.bank_name,
                        branch: null
                    },
                    status: member.status
                };
            });

            res.json({
                staff: staffExternal,
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
 * Filter staff by services and availability
 * GET /api/staff/:storeId/filter?serviceIds=uuid,uuid&date=YYYY-MM-DD&time=HH:MM
 * Response: [{ staffId, name }]
 * Availability logic: staff is considered available if the provided date's weekday is in workingDays
 * and the provided time is between workingHoursStart (inclusive) and workingHoursEnd (exclusive).
 * If no time provided but date provided, only day match is checked. If neither date nor time provided, only services filter applies.
 */
router.get('/:storeId/filter',
    authenticateToken,
    validateParams(storeIdSchema),
    async (req, res) => {
        try {
            const { storeId } = req.params;
            const userId = req.user.id;
            const { serviceIds, date, time } = req.query;

            // Access check
            const storeAccess = await database.query(
                `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
                [storeId, userId]
            );
            if (storeAccess.rows.length === 0) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Parse service IDs
            let serviceIdArray = [];
            if (serviceIds) {
                serviceIdArray = serviceIds.split(',').map(s => s.trim()).filter(Boolean);
            }

            // Basic validation
            if (serviceIdArray.some(id => !/^[0-9a-fA-F-]{36}$/.test(id))) {
                return res.status(400).json({ error: 'Invalid serviceIds format' });
            }
            if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
            }
            if (time && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) {
                return res.status(400).json({ error: 'Invalid time format. Use HH:MM (24h)' });
            }

            // Map weekday number to name used in workingDays
            let weekdayName = null;
            if (date) {
                const d = new Date(date + 'T00:00:00Z');
                if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid date value' });
                const weekdayIndex = d.getUTCDay(); // 0=Sun
                const names = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
                weekdayName = names[weekdayIndex];
            }

            // Build base query selecting staff with optional service filter.
            // We select shifts JSON to evaluate availability in JS.
            let baseQuery = `SELECT s.id, s.name, s.shifts FROM staff s`;
            const queryParams = [];
            let whereParts = ['s.store_id = $' + (queryParams.push(storeId))];
            whereParts.push(`s.status = 'active'`);

            if (serviceIdArray.length) {
                // Join staff_services and ensure staff linked to ALL provided services (intersection).
                // We can filter using GROUP BY HAVING count(distinct service_id) = number of services requested.
                baseQuery = `SELECT s.id, s.name, s.shifts
                             FROM staff s
                             JOIN staff_services ss ON ss.staff_id = s.id`;
                whereParts.push(`ss.service_id = ANY($${queryParams.push(serviceIdArray)})`);
            }

            const finalQuery = serviceIdArray.length ?
                `${baseQuery} WHERE ${whereParts.join(' AND ')}
                 GROUP BY s.id, s.name, s.shifts
                 HAVING COUNT(DISTINCT ss.service_id) = $${queryParams.push(serviceIdArray.length)}` :
                `${baseQuery} WHERE ${whereParts.join(' AND ')}`;

            const dbResult = await database.query(finalQuery, queryParams);

            let candidates = dbResult.rows;

            // Availability filtering in JS
            if (weekdayName) {
                candidates = candidates.filter(c => {
                    try {
                        const shifts = c.shifts;
                        if (!shifts || !Array.isArray(shifts.workingDays)) return false;
                        if (!shifts.workingDays.includes(weekdayName)) return false;
                        if (time) {
                            const start = shifts.workingHoursStart;
                            const end = shifts.workingHoursEnd;
                            if (!start || !end) return false;
                            return time >= start && time < end; // inclusive start, exclusive end
                        }
                        return true;
                    } catch (e) {
                        return false;
                    }
                });
            }

            const response = candidates.map(c => ({ staffId: c.id, name: c.name }));
            res.json({ staff: response, count: response.length });
        } catch (error) {
            console.error('Error filtering staff:', error);
            res.status(500).json({ error: 'Failed to filter staff' });
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
 * Get minimal staff list (id & name) for a store filtered by a single service ID
 * GET /api/staff/:storeId/by-service/:serviceId
 * Response: { staff: [{ staffId, name }] }
 */
router.get('/:storeId/by-service/:serviceId',
    authenticateToken,
    validateParams(storeServiceIdSchema),
    async (req, res) => {
        try {
            const { storeId, serviceId } = req.params;
            const userId = req.user.id;

            // Access check
            const storeAccess = await database.query(
                `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
                [storeId, userId]
            );
            if (storeAccess.rows.length === 0) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Ensure service belongs to store
            const svc = await database.query(
                'SELECT id FROM services WHERE id = $1 AND store_id = $2',
                [serviceId, storeId]
            );
            if (svc.rows.length === 0) {
                return res.status(404).json({ error: 'Service not found in this store' });
            }

            const result = await database.query(
                `SELECT s.id, s.name
                 FROM staff s
                 JOIN staff_services ss ON ss.staff_id = s.id
                 WHERE s.store_id = $1 AND ss.service_id = $2 AND s.status = 'active'
                 ORDER BY s.name ASC`,
                [storeId, serviceId]
            );

            const staff = result.rows.map(r => ({ staffId: r.id, name: r.name }));
            res.json({ staff });
        } catch (error) {
            console.error('Error fetching staff by service:', error);
            res.status(500).json({ error: 'Failed to fetch staff by service' });
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
            const svcResult = await database.query(
                'SELECT service_id FROM staff_services WHERE staff_id = $1',
                [staff.id]
            );
            const serviceIds = svcResult.rows.map(r => r.service_id);

            // Always external format now
            const shiftObj = staff.shifts || {};
            const activeDays = Array.isArray(shiftObj.workingDays) ? shiftObj.workingDays : [];
            const daysOrder = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
            const dayShifts = daysOrder.map(day => ({
                day: day.charAt(0).toUpperCase() + day.slice(1),
                active: activeDays.includes(day),
                startTime: shiftObj.workingHoursStart || '09:00',
                endTime: shiftObj.workingHoursEnd || '18:00'
            }));
            // Map service IDs to names
            let serviceNames = [];
            if (serviceIds.length) {
                const svcNameRes = await database.query(
                    'SELECT id, name FROM services WHERE id = ANY($1)',
                    [serviceIds]
                );
                const idToName = {};
                svcNameRes.rows.forEach(r => { idToName[r.id] = r.name; });
                serviceNames = serviceIds.map(id => idToName[id]).filter(Boolean);
            }
            const sal = staff.salary || { earnings: {}, deductions: {} };
            const earningsArr = [];
            if (sal.earnings) {
                if (sal.earnings.basic != null) earningsArr.push({ name: 'Basic', amount: Number(sal.earnings.basic) });
                if (sal.earnings.hra != null) earningsArr.push({ name: 'HRA', amount: Number(sal.earnings.hra) });
                if (sal.earnings.otherAllowances != null && sal.earnings.otherAllowances !== 0) earningsArr.push({ name: 'Other Allowances', amount: Number(sal.earnings.otherAllowances) });
            }
            const deductionsArr = [];
            if (sal.deductions) {
                if (sal.deductions.professionalTax != null && sal.deductions.professionalTax !== 0) deductionsArr.push({ name: 'Professional Tax', amount: Number(sal.deductions.professionalTax) });
                if (sal.deductions.epf != null && sal.deductions.epf !== 0) deductionsArr.push({ name: 'EPF', amount: Number(sal.deductions.epf) });
            }
            const totalEarnings = earningsArr.reduce((a,c)=>a+c.amount,0);
            const totalDeductions = deductionsArr.reduce((a,c)=>a+c.amount,0);
            const grossPay = totalEarnings;
            const netPay = grossPay - totalDeductions;
            const comm = staff.commission;
            let slabs = [];
            if (comm && Array.isArray(comm.commissionRates)) {
                slabs = comm.commissionRates.map(r => ({
                    from: r.minRevenue,
                    to: r.maxRevenue,
                    value: r.commission,
                    basis: r.type.charAt(0).toUpperCase() + r.type.slice(1)
                }));
            }
            res.json({
                staffId: staff.id,
                storeId: staff.store_id,
                personal: {
                    name: staff.name,
                    gender: staff.gender,
                    phone: staff.contact,
                    email: staff.email,
                    dateOfBirth: staff.dob,
                    dateOfJoining: staff.doj,
                    documentName: staff.document_id || null
                },
                role: {
                    role: staff.role,
                    designation: staff.designation,
                    services: serviceNames,
                    shifts: dayShifts
                },
                salary: {
                    type: 'Monthly',
                    cycle: '1 to 1 of Every Month',
                    earnings: earningsArr,
                    deductions: deductionsArr,
                    totals: { totalEarnings, totalDeductions, grossPay, netPay }
                },
                commission: comm ? {
                    type: comm.commissionType.charAt(0).toUpperCase() + comm.commissionType.slice(1),
                    bracketPeriod: comm.commissionCycle.charAt(0).toUpperCase() + comm.commissionCycle.slice(1),
                    startDate: null,
                    slabs
                } : null,
                bank: {
                    accountName: staff.banking_name,
                    accountNumber: staff.account_number,
                    ifsc: staff.ifsc_code,
                    bankName: staff.bank_name,
                    branch: null
                },
                status: staff.status
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
            const original = req.body;
            let updates = original;
            let servicesUpdate = undefined;
            // Detect nested format
            const isExternalUpdate = original.personal && original.role; // external variant
            const isNestedUpdate = original.personal && original.employment; // previous nested internal variant
            if (isExternalUpdate) {
                updates = {};
                // personal -> internal
                const p = original.personal;
                if (p.name !== undefined) updates.name = p.name;
                if (p.phone !== undefined) updates.contact = p.phone;
                if (p.gender !== undefined) updates.gender = (p.gender || '').toLowerCase();
                if (p.email !== undefined) updates.email = p.email;
                if (p.dateOfJoining !== undefined) updates.doj = p.dateOfJoining;
                if (p.dateOfBirth !== undefined) updates.dob = p.dateOfBirth;
                if (p.documentName !== undefined) updates.documentId = p.documentName;
                // role
                const r = original.role || {};
                if (r.designation !== undefined) updates.designation = r.designation;
                if (r.role !== undefined) updates.role = r.role;
                if (Array.isArray(r.shifts)) {
                    const activeDays = r.shifts.filter(d => d.active);
                    let workingHoursStart = null, workingHoursEnd = null;
                    if (activeDays.length) {
                        workingHoursStart = activeDays[0].startTime;
                        workingHoursEnd = activeDays[0].endTime;
                        const starts = activeDays.map(d => d.startTime).sort();
                        const ends = activeDays.map(d => d.endTime).sort();
                        if (new Set(starts).size > 1) workingHoursStart = starts[0];
                        if (new Set(ends).size > 1) workingHoursEnd = ends[ends.length - 1];
                    }
                    updates.shifts = {
                        workingDays: activeDays.map(d => d.day.toLowerCase()),
                        workingHoursStart: workingHoursStart || '09:00',
                        workingHoursEnd: workingHoursEnd || '18:00'
                    };
                }
                if (Object.prototype.hasOwnProperty.call(r, 'services')) {
                    servicesUpdate = r.services || [];
                }
                // salary
                if (original.salary) {
                    const s = original.salary;
                    const earnings = { basic: 0, hra: 0, otherAllowances: 0 };
                    (s.earnings || []).forEach(e => {
                        const n = (e.name || '').toLowerCase();
                        if (n === 'basic') earnings.basic += e.amount;
                        else if (n === 'hra') earnings.hra += e.amount;
                        else earnings.otherAllowances += e.amount;
                    });
                    const deductions = { professionalTax: 0, epf: 0 };
                    (s.deductions || []).forEach(d => {
                        const n = (d.name || '').toLowerCase();
                        if (n.includes('professional')) deductions.professionalTax += d.amount;
                        else if (n === 'epf') deductions.epf += d.amount;
                    });
                    updates.salary = { earnings, deductions };
                }
                // commission
                if (original.commission) {
                    const c = original.commission;
                    updates.commission = {
                        commissionType: (c.type || 'percentage').toLowerCase(),
                        commissionCycle: (c.bracketPeriod || 'monthly').toLowerCase(),
                        commissionRates: (c.slabs || []).map(sl => ({
                            type: (sl.basis || 'services').toLowerCase(),
                            commissionType: (c.type || 'percentage').toLowerCase(),
                            minRevenue: sl.from,
                            maxRevenue: sl.to,
                            commission: sl.value
                        }))
                    };
                }
                // banking
                if (original.bank) {
                    const b = original.bank;
                    if (b.accountNumber !== undefined) updates.accountNumber = b.accountNumber;
                    if (b.ifsc !== undefined) updates.ifscCode = b.ifsc;
                    if (b.accountName !== undefined) updates.bankingName = b.accountName;
                    if (b.bankName !== undefined) updates.bankName = b.bankName;
                }
            } else if (isNestedUpdate || original.personal || original.employment || original.compensation || original.documents || original.banking) {
                updates = {};
                if (original.personal) {
                    Object.assign(updates, {
                        name: original.personal.name,
                        contact: original.personal.contact,
                        gender: original.personal.gender,
                        email: original.personal.email,
                        doj: original.personal.doj,
                        dob: original.personal.dob
                    });
                }
                if (original.employment) {
                    Object.assign(updates, {
                        designation: original.employment.designation,
                        role: original.employment.role,
                        shifts: original.employment.shifts
                    });
                    if (Object.prototype.hasOwnProperty.call(original.employment, 'services')) {
                        servicesUpdate = original.employment.services || [];
                    }
                }
                if (original.compensation) {
                    Object.assign(updates, {
                        salary: original.compensation.salary,
                        commission: original.compensation.commission
                    });
                }
                if (original.documents) {
                    Object.assign(updates, {
                        documentId: original.documents.documentId,
                        photoId: original.documents.photoId
                    });
                }
                if (original.banking) {
                    Object.assign(updates, {
                        accountNumber: original.banking.accountNumber,
                        ifscCode: original.banking.ifscCode,
                        bankingName: original.banking.bankingName,
                        bankName: original.banking.bankName
                    });
                }
                if (original.status) updates.status = original.status;
            } else if (original.services) {
                servicesUpdate = original.services; // legacy flat services
            }

            // Fetch staff member first for self check
            const staffRowForAuth = await database.query(
                'SELECT id, user_id, store_id FROM staff WHERE id = $1 AND store_id = $2',
                [staffId, storeId]
            );
            if (staffRowForAuth.rows.length === 0) {
                return res.status(404).json({ error: 'Staff member not found' });
            }
            const targetStaff = staffRowForAuth.rows[0];
            const isSelf = targetStaff.user_id === userId;

            const storeAccess = await database.query(
                'SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2',
                [storeId, userId]
            );
            const role = storeAccess.rows.length ? storeAccess.rows[0].role : null;
            const isAdmin = ['owner','manager'].includes(role);

            if (!isSelf && !isAdmin) {
                return res.status(403).json({ error: 'Access denied. Only owners/managers can update other staff.' });
            }

            const selfUpdate = isSelf && !isAdmin; // limited fields if just self
            if (process.env.NODE_ENV === 'development') {
                console.log('[STAFF UPDATE AUTH]', { storeId, staffId, userId, isSelf, role, selfUpdate });
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

            // Restrict self updates to a safe subset of fields
            const allowedSelfFields = new Set([
                'name','contact','gender','email','dob','shifts','documentId','photoId',
                'accountNumber','ifscCode','bankingName','bankName'
            ]);
            if (selfUpdate) {
                const disallowed = Object.keys(updates).filter(k => !allowedSelfFields.has(k));
                if (disallowed.length) {
                    return res.status(403).json({
                        error: 'Self update not allowed for some fields',
                        disallowed
                    });
                }
            }

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

            // Update user table if contact or email changed (only if not selfUpdate OR allowed self fields)
            if (updates.contact || updates.email) {
                const userUpdates = [];
                const userValues = [];
                let userParamCount = 0;

                if (updates.contact) {
                    userParamCount++;
                    // In users table the phone field might be phone_number instead of contact; adjust if needed
                    userUpdates.push(`phone_number = $${userParamCount}`);
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

            // Update services mappings if requested
            if (servicesUpdate) {
                let serviceIdsToUse = servicesUpdate;
                // If array contains non-uuid strings assume they are names (external update) -> map
                const allLookLikeUUID = servicesUpdate.every(id => /^[0-9a-fA-F-]{36}$/.test(id));
                if (!allLookLikeUUID) {
                    const svcLookup = await database.query(
                        'SELECT id, name FROM services WHERE store_id = $1 AND name = ANY($2)',
                        [storeId, servicesUpdate]
                    );
                    const nameToId = {};
                    svcLookup.rows.forEach(r => { nameToId[r.name] = r.id; });
                    const missingNames = servicesUpdate.filter(n => !nameToId[n]);
                    if (missingNames.length) {
                        await database.query('ROLLBACK');
                        return res.status(400).json({ error: 'Some services not found for this store', missing: missingNames });
                    }
                    serviceIdsToUse = servicesUpdate.map(n => nameToId[n]);
                } else {
                    // Validate ids belong to store
                    const serviceCheck = await database.query(
                        'SELECT id FROM services WHERE id = ANY($1) AND store_id = $2',
                        [servicesUpdate, storeId]
                    );
                    const found = serviceCheck.rows.map(r => r.id);
                    const missing = servicesUpdate.filter(id => !found.includes(id));
                    if (missing.length) {
                        await database.query('ROLLBACK');
                        return res.status(400).json({ error: 'Some services not found for this store', missing });
                    }
                }
                await database.query('DELETE FROM staff_services WHERE staff_id = $1', [staffId]);
                for (const svcId of serviceIdsToUse) {
                    await database.query(
                        `INSERT INTO staff_services (staff_id, service_id, store_id) VALUES ($1, $2, $3)
                         ON CONFLICT (staff_id, service_id) DO NOTHING`,
                        [staffId, svcId, storeId]
                    );
                }
            }

            // Commit transaction
            await database.query('COMMIT');

            const updatedStaff = result.rows[0];

            const svcRows = await database.query(
                'SELECT ss.service_id, sv.name FROM staff_services ss JOIN services sv ON sv.id = ss.service_id WHERE ss.staff_id = $1',
                [updatedStaff.id]
            );
            const serviceNames = svcRows.rows.map(r => r.name);

            // Build external response format
            const shiftObj = updatedStaff.shifts || {};
            const daysOrder = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
            const dayShifts = daysOrder.map(d => ({
                day: d.charAt(0).toUpperCase() + d.slice(1),
                active: Array.isArray(shiftObj.workingDays) ? shiftObj.workingDays.includes(d) : false,
                startTime: shiftObj.workingHoursStart || '09:00',
                endTime: shiftObj.workingHoursEnd || '18:00'
            }));
            const sal = updatedStaff.salary || { earnings: {}, deductions: {} };
            const earningsArr = [];
            if (sal.earnings) {
                if (sal.earnings.basic != null) earningsArr.push({ name: 'Basic', amount: Number(sal.earnings.basic) });
                if (sal.earnings.hra != null) earningsArr.push({ name: 'HRA', amount: Number(sal.earnings.hra) });
                if (sal.earnings.otherAllowances != null && sal.earnings.otherAllowances !== 0) earningsArr.push({ name: 'Other Allowances', amount: Number(sal.earnings.otherAllowances) });
            }
            const deductionsArr = [];
            if (sal.deductions) {
                if (sal.deductions.professionalTax != null && sal.deductions.professionalTax !== 0) deductionsArr.push({ name: 'Professional Tax', amount: Number(sal.deductions.professionalTax) });
                if (sal.deductions.epf != null && sal.deductions.epf !== 0) deductionsArr.push({ name: 'EPF', amount: Number(sal.deductions.epf) });
            }
            const totalEarnings = earningsArr.reduce((a,c)=>a+c.amount,0);
            const totalDeductions = deductionsArr.reduce((a,c)=>a+c.amount,0);
            const grossPay = totalEarnings;
            const netPay = grossPay - totalDeductions;
            const comm = updatedStaff.commission;
            let slabs = [];
            if (comm && Array.isArray(comm.commissionRates)) {
                slabs = comm.commissionRates.map(r => ({
                    from: r.minRevenue,
                    to: r.maxRevenue,
                    value: r.commission,
                    basis: r.type.charAt(0).toUpperCase() + r.type.slice(1)
                }));
            }
            res.json({
                staffId: updatedStaff.id,
                storeId: updatedStaff.store_id,
                personal: {
                    name: updatedStaff.name,
                    gender: updatedStaff.gender,
                    phone: updatedStaff.contact,
                    email: updatedStaff.email,
                    dateOfBirth: updatedStaff.dob,
                    dateOfJoining: updatedStaff.doj,
                    documentName: updatedStaff.document_id || null
                },
                role: {
                    role: updatedStaff.role,
                    designation: updatedStaff.designation,
                    services: serviceNames,
                    shifts: dayShifts
                },
                salary: {
                    type: 'Monthly',
                    cycle: '1 to 1 of Every Month',
                    earnings: earningsArr,
                    deductions: deductionsArr,
                    totals: { totalEarnings, totalDeductions, grossPay, netPay }
                },
                commission: comm ? {
                    type: comm.commissionType ? (comm.commissionType.charAt(0).toUpperCase() + comm.commissionType.slice(1)) : null,
                    bracketPeriod: comm.commissionCycle ? (comm.commissionCycle.charAt(0).toUpperCase() + comm.commissionCycle.slice(1)) : null,
                    startDate: null,
                    slabs
                } : null,
                bank: {
                    accountName: updatedStaff.banking_name,
                    accountNumber: updatedStaff.account_number,
                    ifsc: updatedStaff.ifsc_code,
                    bankName: updatedStaff.bank_name,
                    branch: null
                },
                status: updatedStaff.status
            });

        } catch (error) {
            await database.query('ROLLBACK');
            console.error('Error updating staff:', error);
            res.status(500).json({ error: 'Failed to update staff member' });
        }
    }
);

module.exports = router;
