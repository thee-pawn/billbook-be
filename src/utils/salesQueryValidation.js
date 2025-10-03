const Joi = require('joi');

const createSalesQuerySchema = Joi.object({
  phoneNumber: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).min(10).max(20).optional().allow(''),
  email: Joi.string().email().max(255).optional().allow(''),
  name: Joi.string().required().min(1).max(255).trim(),
  query: Joi.string().required().min(1).max(5000).trim()
});

const updateSalesQueryStatusSchema = Joi.object({
  status: Joi.string().valid('open', 'closed').required()
});

const listSalesQueriesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('open', 'closed').optional()
});

const salesQueryIdParamSchema = Joi.object({
  salesQueryId: Joi.string().uuid().required()
});

module.exports = {
  createSalesQuerySchema,
  updateSalesQueryStatusSchema,
  listSalesQueriesSchema,
  salesQueryIdParamSchema
};
