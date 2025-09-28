const Joi = require('joi');

const uuid = Joi.string().uuid();

const serviceEntrySchema = Joi.object({
  serviceId: uuid.required(),
  staffId: uuid.allow(null),
  position: Joi.number().integer().min(0).optional()
});

const baseAppointmentSchema = {
  phoneNumber: Joi.string().trim().min(6).max(20).required(),
  customerName: Joi.string().trim().max(150).required(),
  gender: Joi.string().valid('male','female','other').optional(),
  source: Joi.string().trim().max(50).allow('', null),
  date: Joi.date().iso().required(),
  time: Joi.string().pattern(/^([01]?\d|2[0-3]):[0-5]\d$/).required(),
  status: Joi.string().valid('scheduled','in-progress','completed','cancelled').default('scheduled'),
  services: Joi.array().items(serviceEntrySchema).min(1).required(),
  totalDurationMinutes: Joi.number().integer().min(0).required(),
  totalAmount: Joi.number().precision(2).min(0).required(),
  advanceAmount: Joi.number().precision(2).min(0).required(),
  payableAmount: Joi.number().precision(2).min(0).required(),
  paymentMode: Joi.string().trim().max(30).allow(null,''),
  notes: Joi.string().allow('', null)
};

const createAppointmentSchema = Joi.object(baseAppointmentSchema);
const updateAppointmentSchema = Joi.object(baseAppointmentSchema);

const storeIdParamSchema = Joi.object({
  storeId: uuid.required()
});

const storeAppointmentIdParamSchema = Joi.object({
  storeId: uuid.required(),
  appointmentId: uuid.required()
});

module.exports = {
  createAppointmentSchema,
  updateAppointmentSchema,
  storeIdParamSchema,
  storeAppointmentIdParamSchema
};
