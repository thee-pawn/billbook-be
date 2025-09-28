const express = require('express');
const router = express.Router({ mergeParams: true });
const database = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');
const { validate, validateParams } = require('../middleware/validation');
const {
  createAppointmentSchema,
  updateAppointmentSchema,
  storeIdParamSchema,
  storeAppointmentIdParamSchema
} = require('../utils/appointmentValidation');
const { processCustomerAndAdvance } = require('../services/customerAdvanceService');

async function checkStoreAccess(storeId, userId) {
  const res = await database.query(
    'SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2',
    [storeId, userId]
  );
  return res.rows.length ? res.rows[0].role : null;
}

function mapAppointmentRow(row, services) {
  return {
    id: row.id,
    storeId: row.store_id,
    customerId: row.customer_id,
    phoneNumber: row.phone_number,
    customerName: row.customer_name,
    gender: row.gender,
    source: row.source,
    date: row.appointment_date,
    time: row.appointment_time ? row.appointment_time.toString().substring(0,5) : null,
    status: row.status,
    services: services.map(s => ({
      id: s.id,
      serviceId: s.service_id,
      staffId: s.staff_id,
      position: s.position
    })),
    totalDurationMinutes: row.total_duration_minutes,
    totalAmount: parseFloat(row.total_amount),
    advanceAmount: parseFloat(row.advance_amount),
    payableAmount: parseFloat(row.payable_amount),
    paymentMode: row.payment_mode,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Create appointment
router.post('/store/:storeId/appointments', authenticateToken, generalLimiter, validateParams(storeIdParamSchema), validate(createAppointmentSchema), async (req, res) => {
  const { storeId } = req.params;
  const userId = req.user.id;
  const body = req.body;

  try {
    const role = await checkStoreAccess(storeId, userId);
    if (!role) {
      return res.status(403).json({ success: false, message: 'No access to this store' });
    }

    await database.query('BEGIN');
    
    // Process customer creation/lookup and advance payment
    const appointmentData = {
      phone_number: body.phoneNumber,
      name: body.customerName,
      customer_name: body.customerName,
      gender: body.gender,
      advance_amount: body.advanceAmount
    };
    
    const customerResult = await processCustomerAndAdvance(
      { query: database.query.bind(database) }, // Pass query function for transaction
      storeId,
      appointmentData,
      'appointment',
      null, // Will be updated with appointment ID after creation
      userId
    );

    const insertAppt = await database.query(
      `INSERT INTO appointments (
        store_id, customer_id, phone_number, customer_name, gender, source,
        appointment_date, appointment_time, status,
        total_duration_minutes, total_amount, advance_amount, payable_amount,
        payment_mode, notes, created_by, updated_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16
      ) RETURNING *`,
      [
        storeId, customerResult.customerId, body.phoneNumber, body.customerName, body.gender || null, body.source || null,
        body.date, body.time, body.status || 'scheduled',
        body.totalDurationMinutes, body.totalAmount, body.advanceAmount, body.payableAmount,
        body.paymentMode || null, body.notes || null, userId
      ]
    );

    const apptId = insertAppt.rows[0].id;

    // Update the advance payment record with the appointment ID
    if (customerResult.advancePaymentRecord && body.advanceAmount > 0) {
      await database.query(
        `UPDATE customer_wallet_history 
         SET transaction_reference_id = $1, 
             description = $2
         WHERE id = $3`,
        [
          apptId,
          `Advance payment for appointment #${apptId}`,
          customerResult.advancePaymentRecord.id
        ]
      );
    }

    // Insert services
    let position = 0;
    for (const svc of body.services) {
      await database.query(
        `INSERT INTO appointment_services (appointment_id, service_id, staff_id, position)
         VALUES ($1,$2,$3,$4)`,
        [apptId, svc.serviceId, svc.staffId || null, svc.position != null ? svc.position : position]
      );
      position++;
    }

    // Fetch services for response
    const servicesRows = await database.query(
      'SELECT * FROM appointment_services WHERE appointment_id = $1 ORDER BY position ASC',
      [apptId]
    );

    await database.query('COMMIT');

    const response = mapAppointmentRow(insertAppt.rows[0], servicesRows.rows);
    
    // Add customer information to response
    response.customer = customerResult.customer;
    response.isNewCustomer = customerResult.isNewCustomer;
    res.status(201).json({ success: true, message: 'Appointment created', data: { appointment: response } });
  } catch (error) {
    await database.query('ROLLBACK');
    console.error('Error creating appointment:', error);
    res.status(500).json({ success: false, message: 'Failed to create appointment' });
  }
});

// List appointments for a store (optional filters date, status)
router.get('/store/:storeId/appointments', authenticateToken, generalLimiter, validateParams(storeIdParamSchema), async (req, res) => {
  const { storeId } = req.params;
  const userId = req.user.id;
  const { date, status, page = 1, limit = 20 } = req.query;

  try {
    const role = await checkStoreAccess(storeId, userId);
    if (!role) return res.status(403).json({ success: false, message: 'No access to this store' });

    let where = 'WHERE a.store_id = $1';
    const params = [storeId];
    let p = 2;
    if (date) { where += ` AND a.appointment_date = $${p++}`; params.push(date); }
    if (status) { where += ` AND a.status = $${p++}`; params.push(status); }

    const offset = (page - 1) * limit;
    const countRes = await database.query(`SELECT COUNT(*) FROM appointments a ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const listRes = await database.query(
      `SELECT * FROM appointments a ${where} ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT $${p} OFFSET $${p+1}`,
      [...params, limit, offset]
    );
    const apptIds = listRes.rows.map(r => r.id);
    let servicesMap = {};
    if (apptIds.length) {
      const svcRes = await database.query(
        'SELECT * FROM appointment_services WHERE appointment_id = ANY($1) ORDER BY position ASC',
        [apptIds]
      );
      servicesMap = svcRes.rows.reduce((acc,row) => {
        if (!acc[row.appointment_id]) acc[row.appointment_id] = [];
        acc[row.appointment_id].push(row);
        return acc;
      }, {});
    }

    const appointments = listRes.rows.map(r => mapAppointmentRow(r, servicesMap[r.id] || []));

    res.json({
      success: true,
      message: 'Appointments retrieved',
      data: {
        appointments,
        pagination: {
          page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error listing appointments:', error);
    res.status(500).json({ success: false, message: 'Failed to list appointments' });
  }
});

// Get single appointment
router.get('/store/:storeId/appointments/:appointmentId', authenticateToken, generalLimiter, validateParams(storeAppointmentIdParamSchema), async (req,res) => {
  const { storeId, appointmentId } = req.params;
  const userId = req.user.id;
  try {
    const role = await checkStoreAccess(storeId, userId);
    if (!role) return res.status(403).json({ success: false, message: 'No access to this store' });

    const apptRes = await database.query(
      'SELECT * FROM appointments WHERE id = $1 AND store_id = $2',
      [appointmentId, storeId]
    );
    if (!apptRes.rows.length) return res.status(404).json({ success:false, message:'Appointment not found' });

    const svcRes = await database.query(
      'SELECT * FROM appointment_services WHERE appointment_id = $1 ORDER BY position ASC',
      [appointmentId]
    );
    const response = mapAppointmentRow(apptRes.rows[0], svcRes.rows);
    res.json({ success: true, message: 'Appointment retrieved', data: { appointment: response } });
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({ success:false, message:'Failed to fetch appointment' });
  }
});

// Update appointment
router.put('/store/:storeId/appointments/:appointmentId', authenticateToken, generalLimiter, validateParams(storeAppointmentIdParamSchema), validate(updateAppointmentSchema), async (req,res) => {
  const { storeId, appointmentId } = req.params;
  const userId = req.user.id;
  const body = req.body;
  try {
    const role = await checkStoreAccess(storeId, userId);
    if (!role) return res.status(403).json({ success: false, message: 'No access to this store' });

    await database.query('BEGIN');

    const existing = await database.query(
      'SELECT * FROM appointments WHERE id = $1 AND store_id = $2 FOR UPDATE',
      [appointmentId, storeId]
    );
    if (!existing.rows.length) {
      await database.query('ROLLBACK');
      return res.status(404).json({ success:false, message:'Appointment not found' });
    }

    const updateRes = await database.query(
      `UPDATE appointments SET
        phone_number = $1,
        customer_name = $2,
        gender = $3,
        source = $4,
        appointment_date = $5,
        appointment_time = $6,
        status = $7,
        total_duration_minutes = $8,
        total_amount = $9,
        advance_amount = $10,
        payable_amount = $11,
        payment_mode = $12,
        notes = $13,
        updated_by = $14,
        updated_at = NOW()
       WHERE id = $15 AND store_id = $16
       RETURNING *`,
      [
        body.phoneNumber, body.customerName, body.gender || null, body.source || null,
        body.date, body.time, body.status,
        body.totalDurationMinutes, body.totalAmount, body.advanceAmount, body.payableAmount,
        body.paymentMode || null, body.notes || null, userId,
        appointmentId, storeId
      ]
    );

    // Replace services
    await database.query('DELETE FROM appointment_services WHERE appointment_id = $1', [appointmentId]);
    let position = 0;
    for (const svc of body.services) {
      await database.query(
        `INSERT INTO appointment_services (appointment_id, service_id, staff_id, position)
         VALUES ($1,$2,$3,$4)`,
        [appointmentId, svc.serviceId, svc.staffId || null, svc.position != null ? svc.position : position]
      );
      position++;
    }

    const svcRes = await database.query(
      'SELECT * FROM appointment_services WHERE appointment_id = $1 ORDER BY position ASC',
      [appointmentId]
    );

    // Adjust customer's advance - resolve the customer via phone
    const custRes = await database.query(
      'SELECT id FROM customers WHERE store_id = $1 AND phone_number = $2',
      [storeId, body.phoneNumber]
    );
    if (custRes.rows.length) {
      const custId = custRes.rows[0].id;
      // Compute delta from previous appointment advance to new advance
      const prevAdv = Number(existing.rows[0].advance_amount || 0);
      const newAdv = Number(body.advanceAmount || 0);
      const delta = newAdv - prevAdv;
      if (delta !== 0) {
        await database.query(
          `UPDATE customers SET advance_amount = COALESCE(advance_amount, 0) + $1, updated_at = NOW()
           WHERE id = $2 AND store_id = $3`,
          [delta, custId, storeId]
        );
      }
    }

    await database.query('COMMIT');

    const response = mapAppointmentRow(updateRes.rows[0], svcRes.rows);
    res.json({ success: true, message: 'Appointment updated', data: { appointment: response } });
  } catch (error) {
    await database.query('ROLLBACK');
    console.error('Error updating appointment:', error);
    res.status(500).json({ success:false, message:'Failed to update appointment' });
  }
});

module.exports = router;
