const express = require('express');
const router = express.Router({ mergeParams: true });
const database = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');
const { validate, validateParams, validateQuery } = require('../middleware/validation');
const {
  createEnquirySchema,
  updateEnquirySchema,
  statusPatchSchema,
  followUpPatchSchema,
  listQuerySchema,
  storeIdParamSchema,
  storeEnquiryIdParamSchema
} = require('../utils/enquiryValidation');
const service = require('../services/enquiryService');

async function checkStoreAccess(storeId, userId) {
  const r = await database.query('SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2', [storeId, userId]);
  return r.rows.length ? r.rows[0].role : null;
}

function mapEnquiry(row) {
  return {
    id: row.id,
    store_id: row.store_id,
    customer_id: row.customer_id,
    contact_no: row.contact_no,
    country_code: row.country_code,
    name: row.name,
    email: row.email,
    gender: row.gender,
    source: row.source,
    enquiry_type: row.enquiry_type,
    enquiry_status: row.enquiry_status,
    notes: row.notes,
    follow_up_at: row.follow_up_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at
  };
}

// Create enquiry
router.post('/:storeId', authenticateToken, generalLimiter, validateParams(storeIdParamSchema), validate(createEnquirySchema), async (req,res) => {
  const { storeId } = req.params;
  const userId = req.user.id;
  const payload = req.body;
  try {
    const role = await checkStoreAccess(storeId, userId);
    if (!role) return res.status(403).json({ success:false, message:'No access to this store' });

    const result = await database.transaction(async (client) => {
      return await service.createEnquiryTx(client, storeId, userId, payload, payload.enquiry_details);
    });

    res.status(201).json({ success:true, message:'Enquiry created', data: { enquiry: mapEnquiry(result.enquiry), details: result.details } });
  } catch (error) {
    console.error('Error creating enquiry:', error);
    res.status(500).json({ success:false, message:'Failed to create enquiry' });
  }
});

// List enquiries
router.get('/:storeId', authenticateToken, generalLimiter, validateParams(storeIdParamSchema), validateQuery(listQuerySchema), async (req,res) => {
  const { storeId } = req.params;
  const userId = req.user.id;
  const { page=1, limit=20, q, status, type, source, from, to, includeDeleted } = req.query;
  try {
    const role = await checkStoreAccess(storeId, userId);
    if (!role) return res.status(403).json({ success:false, message:'No access to this store' });

    const { rows, total } = await service.listEnquiries(storeId, { q, status, type, source, from, to, includeDeleted }, { page: parseInt(page), limit: parseInt(limit) });
    res.json({ success:true, message:'Enquiries retrieved', data: { enquiries: rows.map(mapEnquiry), pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total/limit) } } });
  } catch (error) {
    console.error('Error listing enquiries:', error);
    res.status(500).json({ success:false, message:'Failed to list enquiries' });
  }
});

// Get single enquiry
router.get('/:storeId/:enquiryId', authenticateToken, generalLimiter, validateParams(storeEnquiryIdParamSchema), async (req,res) => {
  const { storeId, enquiryId } = req.params;
  const userId = req.user.id;
  try {
    const role = await checkStoreAccess(storeId, userId);
    if (!role) return res.status(403).json({ success:false, message:'No access to this store' });

    const result = await service.getEnquiryById(storeId, enquiryId);
    if (!result) return res.status(404).json({ success:false, message:'Enquiry not found' });
    res.json({ success:true, message:'Enquiry retrieved', data: { enquiry: mapEnquiry(result.enquiry), details: result.details } });
  } catch (error) {
    console.error('Error fetching enquiry:', error);
    res.status(500).json({ success:false, message:'Failed to fetch enquiry' });
  }
});

// Update enquiry (replace details)
router.put('/:storeId/:enquiryId', authenticateToken, generalLimiter, validateParams(storeEnquiryIdParamSchema), validate(updateEnquirySchema), async (req,res) => {
  const { storeId, enquiryId } = req.params;
  const userId = req.user.id;
  const payload = req.body;
  try {
    const role = await checkStoreAccess(storeId, userId);
    if (!role) return res.status(403).json({ success:false, message:'No access to this store' });

    const result = await database.transaction(async (client) => {
      return await service.updateEnquiryTx(client, storeId, userId, enquiryId, payload, payload.enquiry_details);
    });
    if (!result) return res.status(404).json({ success:false, message:'Enquiry not found' });
    res.json({ success:true, message:'Enquiry updated', data: { enquiry: mapEnquiry(result.enquiry), details: result.details } });
  } catch (error) {
    console.error('Error updating enquiry:', error);
    res.status(500).json({ success:false, message:'Failed to update enquiry' });
  }
});

// Patch status
router.patch('/:storeId/:enquiryId/status', authenticateToken, generalLimiter, validateParams(storeEnquiryIdParamSchema), validate(statusPatchSchema), async (req,res) => {
  const { storeId, enquiryId } = req.params;
  const userId = req.user.id;
  const { enquiry_status } = req.body;
  try {
    const role = await checkStoreAccess(storeId, userId);
    if (!role) return res.status(403).json({ success:false, message:'No access to this store' });
    const updated = await service.updateStatus(storeId, enquiryId, enquiry_status, userId);
    if (!updated) return res.status(404).json({ success:false, message:'Enquiry not found' });
    res.json({ success:true, message:'Enquiry status updated', data: { enquiry: mapEnquiry(updated) } });
  } catch (error) {
    console.error('Error updating enquiry status:', error);
    res.status(500).json({ success:false, message:'Failed to update enquiry status' });
  }
});

// Patch follow-up
router.patch('/:storeId/:enquiryId/follow-up', authenticateToken, generalLimiter, validateParams(storeEnquiryIdParamSchema), validate(followUpPatchSchema), async (req,res) => {
  const { storeId, enquiryId } = req.params;
  const userId = req.user.id;
  const { follow_up_at } = req.body;
  try {
    const role = await checkStoreAccess(storeId, userId);
    if (!role) return res.status(403).json({ success:false, message:'No access to this store' });
    const updated = await service.updateFollowUp(storeId, enquiryId, follow_up_at || null, userId);
    if (!updated) return res.status(404).json({ success:false, message:'Enquiry not found' });
    res.json({ success:true, message:'Enquiry follow-up updated', data: { enquiry: mapEnquiry(updated) } });
  } catch (error) {
    console.error('Error updating follow-up:', error);
    res.status(500).json({ success:false, message:'Failed to update follow-up' });
  }
});

// Soft delete
router.delete('/:storeId/:enquiryId', authenticateToken, generalLimiter, validateParams(storeEnquiryIdParamSchema), async (req,res) => {
  const { storeId, enquiryId } = req.params;
  const userId = req.user.id;
  try {
    const role = await checkStoreAccess(storeId, userId);
    if (!role) return res.status(403).json({ success:false, message:'No access to this store' });
    const ok = await service.softDelete(storeId, enquiryId, userId);
    if (!ok) return res.status(404).json({ success:false, message:'Enquiry not found or already deleted' });
    res.json({ success:true, message:'Enquiry deleted' });
  } catch (error) {
    console.error('Error deleting enquiry:', error);
    res.status(500).json({ success:false, message:'Failed to delete enquiry' });
  }
});

module.exports = router;
