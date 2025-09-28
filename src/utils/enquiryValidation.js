const Joi = require('joi');

const uuid = Joi.string().uuid();

const gender = Joi.string().valid('male','female','other');
const source = Joi.string().valid('walk-in','instagram','facebook','cold-calling','website','client-reference');
const enquiryType = Joi.string().valid('hot','cold','warm');
const enquiryStatus = Joi.string().valid('pending','converted','closed');
const category = Joi.string().valid('service','product','membership-package');

const detailsItem = Joi.object({
  category: category.required(),
  name: Joi.string().trim().max(255).required(),
  reference_id: Joi.alternatives().try(Joi.string().uuid(), Joi.string().trim().max(255)).required()
});

const baseEnquiry = {
  contact_no: Joi.string().regex(/^[0-9]{10}$/).required(),
  country_code: Joi.string().regex(/^\+[0-9]+$/).required(),
  name: Joi.string().trim().max(150).required(),
  email: Joi.string().email({ tlds: { allow: false } }).allow(null,''),
  gender: gender.required(),
  source: source.required(),
  enquiry_type: enquiryType.required(),
  enquiry_status: enquiryStatus.required(),
  notes: Joi.string().allow('', null),
  follow_up_at: Joi.date().iso().allow(null),
  enquiry_details: Joi.array().items(detailsItem).min(1).required()
};

const createEnquirySchema = Joi.object(baseEnquiry);

const updateEnquirySchema = Joi.object({
  contact_no: Joi.string().regex(/^[0-9]{10}$/),
  country_code: Joi.string().regex(/^\+[0-9]+$/),
  name: Joi.string().trim().max(150),
  email: Joi.string().email({ tlds: { allow: false } }).allow(null,''),
  gender,
  source,
  enquiry_type: enquiryType,
  enquiry_status: enquiryStatus,
  notes: Joi.string().allow('', null),
  follow_up_at: Joi.date().iso().allow(null),
  enquiry_details: Joi.array().items(detailsItem).min(1)
}).min(1);

const storeIdParamSchema = Joi.object({ storeId: uuid.required() });
const storeEnquiryIdParamSchema = Joi.object({ storeId: uuid.required(), enquiryId: uuid.required() });

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(200),
  status: enquiryStatus,
  type: enquiryType,
  source,
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  includeDeleted: Joi.boolean().truthy('true','1').falsy('false','0').default(false)
});

const statusPatchSchema = Joi.object({
  enquiry_status: enquiryStatus.required()
});

const followUpPatchSchema = Joi.object({
  follow_up_at: Joi.date().iso().allow(null).required()
});

module.exports = {
  createEnquirySchema,
  updateEnquirySchema,
  statusPatchSchema,
  followUpPatchSchema,
  listQuerySchema,
  storeIdParamSchema,
  storeEnquiryIdParamSchema
};
