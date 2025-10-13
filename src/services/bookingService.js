const database = require('../config/database');
const { processCustomerAndAdvance } = require('./customerAdvanceService');

function computeTotals(items, advanceAmount) {
  const total = items.reduce((sum, it) => sum + Number(it.unit_price) * Number(it.quantity || 1), 0);
  const payable = Math.max(0, total - Number(advanceAmount || 0));
  return { total, payable };
}

async function createBookingTx(client, storeId, userId, payload, items) {
  const { total, payable } = computeTotals(items, payload.advance_amount);
  
  // Process customer creation/lookup and advance payment
  const customerResult = await processCustomerAndAdvance(
    client, 
    storeId, 
    payload, 
    'booking', 
    null, // Will be updated with booking ID after creation
    userId
  );
  
  const resolvedCustomerId = customerResult.customerId;

    const insertBookingQuery = `
        INSERT INTO bookings (
            store_id, customer_id, country_code, contact_no, customer_name, gender, email, address,
            booking_datetime, venue_type, remarks, status, total_amount, advance_amount, payable_amount, payment_mode,
            created_by, updated_by, phone_number
        ) VALUES (
                     $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'scheduled',$12,$13,$14,$15,$16,$17, $18
                 ) RETURNING *`;

    const values = [
        storeId,
        resolvedCustomerId || null,
        payload.country_code,
        payload.contact_no,
        payload.customer_name,
        payload.gender,
        payload.email || null,
        payload.address || null,
        payload.booking_datetime,
        payload.venue_type,
        payload.remarks || null,
        total,
        payload.advance_amount || 0,
        payable,
        payload.payment_mode,
        userId,      // created_by
        userId,
        payload.country_code + payload.contact_no// updated_by (same at creation)
    ];

  const { rows: [booking] } = await client.query(insertBookingQuery, values);

  // Now update the advance payment record with the booking ID
  if (customerResult.advancePaymentRecord && payload.advance_amount > 0) {
    await client.query(
      `UPDATE customer_wallet_history 
       SET transaction_reference_id = $1, 
           description = $2
       WHERE id = $3`,
      [
        booking.id,
        `Advance payment for booking #${booking.id}`,
        customerResult.advancePaymentRecord.id
      ]
    );
  }

  const insertItemQuery = `
    INSERT INTO booking_items (
      booking_id, service_id, service_name, unit_price, staff_id, staff_name, quantity, scheduled_at, venue
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`;

  const itemRows = [];
  for (const it of items) {
    const { rows: [item] } = await client.query(insertItemQuery, [
      booking.id,
      it.service_id,
      it.service_name,
      it.unit_price,
      (it.staff_id === undefined ? null : it.staff_id),
      (it.staff_name === undefined ? null : it.staff_name),
      (it.quantity || 1),
      (it.scheduled_at === undefined ? null : it.scheduled_at),
      (it.venue === undefined ? null : it.venue)
    ]);
    itemRows.push(item);
  }

  return { 
    booking, 
    items: itemRows,
    customer: customerResult.customer,
    isNewCustomer: customerResult.isNewCustomer,
    advancePaymentRecord: customerResult.advancePaymentRecord
  };
}

async function updateBookingTx(client, storeId, userId, bookingId, payload, items) {
  // Lock existing booking row to compute delta and manage customer changes
  const { rows: [existing] } = await client.query(
    'SELECT customer_id, advance_amount FROM bookings WHERE id = $1 AND store_id = $2 AND deleted_at IS NULL FOR UPDATE',
    [bookingId, storeId]
  );
  if (!existing) return null;

  const { total, payable } = computeTotals(items, payload.advance_amount);
  
  // Process customer creation/lookup and advance payment changes
  const customerResult = await processCustomerAndAdvance(
    client,
    storeId,
    payload,
    'booking',
    bookingId,
    userId
  );
  
  const resolvedCustomerId = customerResult.customerId;

  const updateQuery = `
    UPDATE bookings SET
      customer_id = $1,
      country_code = $2,
      contact_no = $3,
      phone_number = $4,
      customer_name = $5,
      gender = $6,
      email = $7,
      address = $8,
      booking_datetime = $9,
      venue_type = $10,
      remarks = $11,
      total_amount = $12,
      advance_amount = $13,
      payable_amount = $14,
      payment_mode = $15,
      updated_by = $16,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $17 AND store_id = $18 AND deleted_at IS NULL
    RETURNING *`;

  const values = [
    payload.customer_id || null, payload.country_code, payload.contact_no, payload.country_code + payload.contact_no,
    payload.customer_name, payload.gender, payload.email || null, payload.address || null,
    payload.booking_datetime, payload.venue_type, payload.remarks || null,
    total, payload.advance_amount || 0, payable, payload.payment_mode,
    userId, bookingId, storeId
  ];
  const { rows: [booking] } = await client.query(updateQuery, values);

  if (!booking) return null;

  // Replace items: delete and insert
  await client.query('DELETE FROM booking_items WHERE booking_id = $1', [bookingId]);

  const insertItemQuery = `
    INSERT INTO booking_items (
      booking_id, service_id, service_name, unit_price, staff_id, staff_name, quantity, scheduled_at, venue
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`;

  const itemRows = [];
  for (const it of items) {
    const { rows: [item] } = await client.query(insertItemQuery, [
      bookingId,
      it.service_id,
      it.service_name,
      it.unit_price,
      (it.staff_id === undefined ? null : it.staff_id),
      (it.staff_name === undefined ? null : it.staff_name),
      (it.quantity || 1),
      (it.scheduled_at === undefined ? null : it.scheduled_at),
      (it.venue === undefined ? null : it.venue)
    ]);
    itemRows.push(item);
  }

  // Adjust customer's advance balance if needed (handle customer change and amount delta)
  const oldCust = existing.customer_id;
  const oldAdv = Number(existing.advance_amount || 0);
  const newCust = payload.customer_id || null;
  const newAdv = Number(payload.advance_amount || 0);

  if (oldCust && newCust && oldCust === newCust) {
    const delta = newAdv - oldAdv;
    if (delta !== 0) {
      await client.query(
        `UPDATE customers SET advance_amount = COALESCE(advance_amount, 0) + $1, updated_at = NOW()
         WHERE id = $2 AND store_id = $3`,
        [delta, oldCust, storeId]
      );
    }
  } else {
    if (oldCust && oldAdv !== 0) {
      await client.query(
        `UPDATE customers SET advance_amount = COALESCE(advance_amount, 0) - $1, updated_at = NOW()
         WHERE id = $2 AND store_id = $3`,
        [oldAdv, oldCust, storeId]
      );
    }
    if (newCust && newAdv !== 0) {
      await client.query(
        `UPDATE customers SET advance_amount = COALESCE(advance_amount, 0) + $1, updated_at = NOW()
         WHERE id = $2 AND store_id = $3`,
        [newAdv, newCust, storeId]
      );
    }
  }

  return { booking, items: itemRows };
}

async function listBookings(storeId, filters, pagination) {
  const { page = 1, limit = 20 } = pagination || {};
  const offset = (page - 1) * limit;
  const values = [storeId];
  let where = 'WHERE b.store_id = $1 AND b.deleted_at IS NULL';

  if (filters.status) { values.push(filters.status); where += ` AND b.status = $${values.length}`; }
  if (filters.from) { values.push(filters.from); where += ` AND b.booking_datetime >= $${values.length}`; }
  if (filters.to) { values.push(filters.to); where += ` AND b.booking_datetime <= $${values.length}`; }
  if (filters.search) {
    values.push(`%${filters.search}%`); where += ` AND (b.customer_name ILIKE $${values.length} OR b.phone_number ILIKE $${values.length})`;
  }

  const sql = `
    SELECT b.*
    FROM bookings b
    ${where}
    ORDER BY b.booking_datetime DESC
    LIMIT ${limit} OFFSET ${offset}`;

  const { rows } = await database.query(sql, values);

  const countSql = `SELECT COUNT(*) FROM bookings b ${where}`;
  const { rows: [cRow] } = await database.query(countSql, values);

  // Fetch items for listed bookings and attach
  const ids = rows.map(r => r.id);
  let itemsByBooking = {};
  if (ids.length) {
    const { rows: itemRows } = await database.query(
      `SELECT * FROM booking_items WHERE booking_id = ANY($1) ORDER BY created_at ASC`,
      [ids]
    );
    for (const it of itemRows) {
      if (!itemsByBooking[it.booking_id]) itemsByBooking[it.booking_id] = [];
      itemsByBooking[it.booking_id].push(it);
    }
  }

  const enriched = rows.map(b => ({ ...b, items: itemsByBooking[b.id] || [] }));
  return { data: enriched, page, limit, total: Number(cRow.count) };
}

async function getBookingById(storeId, bookingId) {
  const sql = `SELECT * FROM bookings WHERE id = $1 AND store_id = $2 AND deleted_at IS NULL`;
  const { rows: [booking] } = await database.query(sql, [bookingId, storeId]);
  if (!booking) return null;
  const { rows: items } = await database.query(
    `SELECT * FROM booking_items WHERE booking_id = $1 ORDER BY created_at ASC`,
    [bookingId]
  );
  return { booking, items };
}

async function updateStatus(storeId, bookingId, status, userId) {
  const { rows: [row] } = await database.query(
    `UPDATE bookings SET status = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND store_id = $4 AND deleted_at IS NULL RETURNING *`,
    [status, userId, bookingId, storeId]
  );
  return row || null;
}

async function softDelete(storeId, bookingId, userId) {
  const { rowCount } = await database.query(
    `UPDATE bookings SET deleted_at = CURRENT_TIMESTAMP, updated_by = $1 WHERE id = $2 AND store_id = $3 AND deleted_at IS NULL`,
    [userId, bookingId, storeId]
  );
  return rowCount > 0;
}

async function withTransaction(fn) {
  const client = await database.getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  computeTotals,
  createBookingTx,
  updateBookingTx,
  listBookings,
  getBookingById,
  updateStatus,
  softDelete,
  withTransaction
};
