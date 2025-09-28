const database = require('../config/database');
const { processCustomerAndAdvance } = require('./customerAdvanceService');

async function linkCustomerId(storeId, country_code, contact_no) {
  const fullPhone = `${country_code}${contact_no}`;
  const res = await database.query('SELECT id FROM customers WHERE store_id = $1 AND phone_number = $2', [storeId, fullPhone]);
  return res.rows.length ? res.rows[0].id : null;
}

async function createEnquiryTx(client, storeId, userId, payload, details) {
  // Process customer creation/lookup and advance payment (if any)
  const customerResult = await processCustomerAndAdvance(
    client,
    storeId,
    payload,
    'enquiry',
    null, // Will be updated with enquiry ID after creation
    userId
  );
  
  const customerId = customerResult.customerId;

  const insert = await client.query(
    `INSERT INTO enquiries (
      store_id, customer_id, contact_no, country_code, name, email, gender,
      source, enquiry_type, enquiry_status, notes, follow_up_at,
      created_by, updated_by
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13
    ) RETURNING *`,
    [storeId, customerId, payload.contact_no, payload.country_code, payload.name, payload.email || null, payload.gender,
     payload.source, payload.enquiry_type, payload.enquiry_status, payload.notes || null, payload.follow_up_at || null, userId]
  );
  const enquiry = insert.rows[0];

  // Update the advance payment record with the enquiry ID (if advance was paid)
  if (customerResult.advancePaymentRecord && payload.advance_amount > 0) {
    await client.query(
      `UPDATE customer_wallet_history 
       SET transaction_reference_id = $1, 
           description = $2
       WHERE id = $3`,
      [
        enquiry.id,
        `Advance payment for enquiry #${enquiry.id}`,
        customerResult.advancePaymentRecord.id
      ]
    );
  }

  for (let i=0;i<details.length;i++) {
    const d = details[i];
    await client.query(
      `INSERT INTO enquiry_details (enquiry_id, category, name, reference_id) VALUES ($1,$2,$3,$4)`,
      [enquiry.id, d.category, d.name, d.reference_id || null]
    );
  }

  const det = await client.query('SELECT * FROM enquiry_details WHERE enquiry_id = $1 ORDER BY created_at ASC', [enquiry.id]);
  return { 
    enquiry, 
    details: det.rows,
    customer: customerResult.customer,
    isNewCustomer: customerResult.isNewCustomer,
    advancePaymentRecord: customerResult.advancePaymentRecord
  };
}

async function listEnquiries(storeId, filters, pagination) {
  const params = [storeId];
  let p = 2;
  let where = 'WHERE e.store_id = $1';
  if (!filters.includeDeleted) where += ' AND e.deleted_at IS NULL';
  if (filters.q) { where += ` AND (e.name ILIKE $${p} OR (e.country_code || e.contact_no) ILIKE $${p})`; params.push(`%${filters.q}%`); p++; }
  if (filters.status) { where += ` AND e.enquiry_status = $${p}`; params.push(filters.status); p++; }
  if (filters.type) { where += ` AND e.enquiry_type = $${p}`; params.push(filters.type); p++; }
  if (filters.source) { where += ` AND e.source = $${p}`; params.push(filters.source); p++; }
  if (filters.from) { where += ` AND (COALESCE(e.follow_up_at, e.created_at)) >= $${p}`; params.push(filters.from); p++; }
  if (filters.to) { where += ` AND (COALESCE(e.follow_up_at, e.created_at)) <= $${p}`; params.push(filters.to); p++; }

  const countRes = await database.query(`SELECT COUNT(*) FROM enquiries e ${where}`, params);
  const total = parseInt(countRes.rows[0].count);
  const listRes = await database.query(
    `SELECT * FROM enquiries e ${where} ORDER BY e.created_at DESC LIMIT $${p} OFFSET $${p+1}`,
    [...params, pagination.limit, (pagination.page-1)*pagination.limit]
  );
  return { rows: listRes.rows, total };
}

async function getEnquiryById(storeId, enquiryId) {
  const head = await database.query('SELECT * FROM enquiries WHERE id = $1 AND store_id = $2', [enquiryId, storeId]);
  if (!head.rows.length) return null;
  const details = await database.query('SELECT * FROM enquiry_details WHERE enquiry_id = $1 ORDER BY created_at ASC', [enquiryId]);
  return { enquiry: head.rows[0], details: details.rows };
}

async function updateEnquiryTx(client, storeId, userId, enquiryId, payload, details) {
  const existing = await client.query('SELECT * FROM enquiries WHERE id = $1 AND store_id = $2 FOR UPDATE', [enquiryId, storeId]);
  if (!existing.rows.length) return null;
  const cur = existing.rows[0];

  // If phone updated, relink customer
  let customerId = cur.customer_id;
  if (payload.contact_no || payload.country_code) {
    const contact_no = payload.contact_no || cur.contact_no;
    const country_code = payload.country_code || cur.country_code;
    const r = await client.query('SELECT id FROM customers WHERE store_id = $1 AND phone_number = $2', [storeId, `${country_code}${contact_no}`]);
    customerId = r.rows.length ? r.rows[0].id : null;
  }

  const update = await client.query(
    `UPDATE enquiries SET
      customer_id = $1,
      contact_no = $2,
      country_code = $3,
      name = $4,
      email = $5,
      gender = $6,
      source = $7,
      enquiry_type = $8,
      enquiry_status = $9,
      notes = $10,
      follow_up_at = $11,
      updated_by = $12,
      updated_at = NOW()
     WHERE id = $13 AND store_id = $14
     RETURNING *`,
    [
      customerId,
      payload.contact_no ?? cur.contact_no,
      payload.country_code ?? cur.country_code,
      payload.name ?? cur.name,
      (payload.email === undefined ? cur.email : (payload.email || null)),
      payload.gender ?? cur.gender,
      payload.source ?? cur.source,
      payload.enquiry_type ?? cur.enquiry_type,
      payload.enquiry_status ?? cur.enquiry_status,
      (payload.notes === undefined ? cur.notes : (payload.notes || null)),
      (payload.follow_up_at === undefined ? cur.follow_up_at : (payload.follow_up_at || null)),
      userId,
      enquiryId,
      storeId
    ]
  );

  if (details) {
    await client.query('DELETE FROM enquiry_details WHERE enquiry_id = $1', [enquiryId]);
    for (const d of details) {
      await client.query('INSERT INTO enquiry_details (enquiry_id, category, name, reference_id) VALUES ($1,$2,$3,$4)', [enquiryId, d.category, d.name, d.reference_id || null]);
    }
  }

  const det = await client.query('SELECT * FROM enquiry_details WHERE enquiry_id = $1 ORDER BY created_at ASC', [enquiryId]);
  return { enquiry: update.rows[0], details: det.rows };
}

async function updateStatus(storeId, enquiryId, status, userId) {
  const res = await database.query('UPDATE enquiries SET enquiry_status = $1, updated_by = $2, updated_at = NOW() WHERE id = $3 AND store_id = $4 RETURNING *', [status, userId, enquiryId, storeId]);
  return res.rows[0] || null;
}

async function updateFollowUp(storeId, enquiryId, followUpAt, userId) {
  const res = await database.query('UPDATE enquiries SET follow_up_at = $1, updated_by = $2, updated_at = NOW() WHERE id = $3 AND store_id = $4 RETURNING *', [followUpAt, userId, enquiryId, storeId]);
  return res.rows[0] || null;
}

async function softDelete(storeId, enquiryId, userId) {
  const res = await database.query('UPDATE enquiries SET deleted_at = NOW(), updated_by = $1, updated_at = NOW() WHERE id = $2 AND store_id = $3 AND deleted_at IS NULL RETURNING id', [userId, enquiryId, storeId]);
  return res.rowCount > 0;
}

module.exports = {
  createEnquiryTx,
  listEnquiries,
  getEnquiryById,
  updateEnquiryTx,
  updateStatus,
  updateFollowUp,
  softDelete
};
