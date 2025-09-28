const Joi = require('joi');

// Reusable pieces
const idSchema = Joi.string().uuid({ version: 'uuidv4' });
const phoneSchema = Joi.string().pattern(/^[0-9]{10}$/).required();
const countryCodeSchema = Joi.string().pattern(/^\+[0-9]+$/).required();
const genderSchema = Joi.string().valid('male', 'female', 'other').required();
const venueTypeSchema = Joi.string().valid('indoor', 'outdoor').required();
const paymentModeSchema = Joi.string().valid('cash', 'card', 'online').required();
const statusSchema = Joi.string().valid('scheduled', 'in-progress', 'completed', 'cancelled');

const bookingItemSchema = Joi.object({
  service_id: idSchema.required(),
  service_name: Joi.string().min(1).max(255).required(),
  unit_price: Joi.number().precision(2).min(0).required(),
  staff_id: idSchema.allow(null),
  staff_name: Joi.string().allow('', null),
  quantity: Joi.number().integer().min(1).default(1),
  scheduled_at: Joi.date().iso().allow(null),
  venue: Joi.string().max(255).allow('', null)
}).required();

const createBookingSchema = Joi.object({
  customer_id: idSchema.allow(null),
  country_code: countryCodeSchema,
  contact_no: phoneSchema,
  customer_name: Joi.string().min(1).max(150).required(),
  gender: genderSchema,
  email: Joi.string().email().allow('', null),
  address: Joi.string().allow('', null),
  booking_datetime: Joi.date().iso().required(),
  venue_type: venueTypeSchema,
  remarks: Joi.string().allow('', null),
  advance_amount: Joi.number().precision(2).min(0).default(0),
  payment_mode: paymentModeSchema,
  items: Joi.array().items(bookingItemSchema).min(1).required()
});

const updateBookingSchema = Joi.object({
  customer_id: idSchema.allow(null),
  country_code: countryCodeSchema,
  contact_no: phoneSchema,
  customer_name: Joi.string().min(1).max(150).required(),
  gender: genderSchema,
  email: Joi.string().email().allow('', null),
  address: Joi.string().allow('', null),
  booking_datetime: Joi.date().iso().required(),
  venue_type: venueTypeSchema,
  remarks: Joi.string().allow('', null),
  advance_amount: Joi.number().precision(2).min(0).default(0),
  payment_mode: paymentModeSchema,
  items: Joi.array().items(bookingItemSchema).min(1).required()
});

const statusPatchSchema = Joi.object({
  status: statusSchema.required()
});

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: statusSchema,
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  search: Joi.string().allow('')
});

const storeIdParamSchema = Joi.object({
  storeId: idSchema.required()
});

const bookingIdParamSchema = Joi.object({
  storeId: idSchema.required(),
  bookingId: idSchema.required()
});

module.exports = {
  createBookingSchema,
  updateBookingSchema,
  statusPatchSchema,
  listQuerySchema,
  storeIdParamSchema,
  bookingIdParamSchema,
  bookingItemSchema
};
