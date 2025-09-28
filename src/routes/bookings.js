const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { validate, validateParams, validateQuery } = require('../middleware/validation');
const { generalLimiter } = require('../middleware/rateLimiter');
const database = require('../config/database');
const {
  createBookingSchema,
  updateBookingSchema,
  statusPatchSchema,
  listQuerySchema,
  storeIdParamSchema,
  bookingIdParamSchema
} = require('../utils/bookingValidation');
const {
  withTransaction,
  createBookingTx,
  updateBookingTx,
  listBookings,
  getBookingById,
  updateStatus,
  softDelete
} = require('../services/bookingService');

async function assertStoreAccess(userId, storeId) {
  const { rows: [rec] } = await database.query(
    'SELECT 1 FROM store_users WHERE user_id = $1 AND store_id = $2',
    [userId, storeId]
  );
  return !!rec;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(it => ({
    ...it,
    // Backward compatibility: accept misspelled key `vanue`
    venue: (it.venue !== undefined ? it.venue : (it.vanue !== undefined ? it.vanue : it.venue))
  }));
}

router.post('/store/:storeId/bookings', authenticateToken, generalLimiter, validateParams(storeIdParamSchema), validate(createBookingSchema), async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const hasAccess = await assertStoreAccess(req.user.id, storeId);
    if (!hasAccess) return res.status(403).json({ success: false, message: 'Forbidden' });

  const { items, ...payload } = req.body;
  const normItems = normalizeItems(items);

  const result = await withTransaction((client) => createBookingTx(client, storeId, req.user.id, payload, normItems));
    return res.status(201).json({ success: true, message: 'Booking created', data: result });
  } catch (err) { next(err); }
});

router.get('/store/:storeId/bookings', authenticateToken, generalLimiter, validateParams(storeIdParamSchema), validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const hasAccess = await assertStoreAccess(req.user.id, storeId);
    if (!hasAccess) return res.status(403).json({ success: false, message: 'Forbidden' });

    const data = await listBookings(storeId, req.query, { page: req.query.page, limit: req.query.limit });
    return res.json({ success: true, message: 'Bookings fetched', data });
  } catch (err) { next(err); }
});

router.get('/store/:storeId/bookings/:bookingId', authenticateToken, generalLimiter, validateParams(bookingIdParamSchema), async (req, res, next) => {
  try {
    const { storeId, bookingId } = req.params;
    const hasAccess = await assertStoreAccess(req.user.id, storeId);
    if (!hasAccess) return res.status(403).json({ success: false, message: 'Forbidden' });

    const data = await getBookingById(storeId, bookingId);
    if (!data) return res.status(404).json({ success: false, message: 'Booking not found' });
    return res.json({ success: true, message: 'Booking fetched', data });
  } catch (err) { next(err); }
});

router.put('/store/:storeId/bookings/:bookingId', authenticateToken, generalLimiter, validateParams(bookingIdParamSchema), validate(updateBookingSchema), async (req, res, next) => {
  try {
    const { storeId, bookingId } = req.params;
    const hasAccess = await assertStoreAccess(req.user.id, storeId);
    if (!hasAccess) return res.status(403).json({ success: false, message: 'Forbidden' });

  const { items, ...payload } = req.body;
  const normItems = normalizeItems(items);
    const exists = await getBookingById(storeId, bookingId);
    if (!exists) return res.status(404).json({ success: false, message: 'Booking not found' });

  const result = await withTransaction((client) => updateBookingTx(client, storeId, req.user.id, bookingId, payload, normItems));
    return res.json({ success: true, message: 'Booking updated', data: result });
  } catch (err) { next(err); }
});

router.patch('/store/:storeId/bookings/:bookingId/status', authenticateToken, generalLimiter, validateParams(bookingIdParamSchema), validate(statusPatchSchema), async (req, res, next) => {
  try {
    const { storeId, bookingId } = req.params;
    const hasAccess = await assertStoreAccess(req.user.id, storeId);
    if (!hasAccess) return res.status(403).json({ success: false, message: 'Forbidden' });

    const row = await updateStatus(storeId, bookingId, req.body.status, req.user.id);
    if (!row) return res.status(404).json({ success: false, message: 'Booking not found' });
    return res.json({ success: true, message: 'Status updated', data: row });
  } catch (err) { next(err); }
});

router.delete('/store/:storeId/bookings/:bookingId', authenticateToken, generalLimiter, validateParams(bookingIdParamSchema), async (req, res, next) => {
  try {
    const { storeId, bookingId } = req.params;
    const hasAccess = await assertStoreAccess(req.user.id, storeId);
    if (!hasAccess) return res.status(403).json({ success: false, message: 'Forbidden' });

    const ok = await softDelete(storeId, bookingId, req.user.id);
    if (!ok) return res.status(404).json({ success: false, message: 'Booking not found' });
    return res.json({ success: true, message: 'Booking deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
