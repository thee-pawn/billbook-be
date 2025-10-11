const Joi = require('joi');

// External (frontend) payload schemas - day shift schema
const dayShiftSchema = Joi.object({
    day: Joi.string().valid('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday').required(),
    active: Joi.boolean().required(),
    startTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    endTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required()
});

const externalSalarySchema = Joi.object({
    type: Joi.string().trim().required(),
    cycle: Joi.string().trim().required(),
    earnings: Joi.array().items(Joi.object({ id: Joi.number().optional(), name: Joi.string().required(), amount: Joi.number().min(0).required() })).min(1).required(),
    deductions: Joi.array().items(Joi.object({ id: Joi.number().optional(), name: Joi.string().required(), amount: Joi.number().min(0).required() })).default([]),
    totals: Joi.object({
        totalEarnings: Joi.number().min(0).required(),
        totalDeductions: Joi.number().min(0).required(),
        grossPay: Joi.number().min(0).required(),
        netPay: Joi.number().min(0).required()
    }).optional()
});

const externalCommissionSchema = Joi.object({
    type: Joi.string().valid('Percentage','percentage','Fixed','fixed').required(),
    bracketPeriod: Joi.string().valid('Weekly','Monthly','weekly','monthly').required(),
    startDate: Joi.date().iso().optional(),
    slabs: Joi.array().items(Joi.object({
        from: Joi.number().min(0).required(),
        to: Joi.number().min(Joi.ref('from')).required(),
        value: Joi.number().min(0).required(),
        basis: Joi.string().valid('Services','Products','Memberships','services','products','memberships').required()
    })).min(1).required()
});

const externalBankSchema = Joi.object({
    accountName: Joi.string().trim().allow(null, '').optional(),
    accountNumber: Joi.string().trim().max(30).allow(null, '').optional(),
    ifsc: Joi.string().alphanum().min(6).max(15).allow(null, '').optional(),
    bankName: Joi.string().trim().allow(null, '').optional(),
    branch: Joi.string().trim().allow(null, '').optional()
});

const externalPersonalSchema = Joi.object({
    name: Joi.string().trim().min(2).max(255).required(),
    gender: Joi.string().trim().required(),
    phone: Joi.string().trim().pattern(/^[0-9]{10,15}$/).required(),
    email: Joi.string().email().allow(null, '').optional(),
    dateOfBirth: Joi.date().iso().allow(null).optional(),
    dateOfJoining: Joi.date().iso().required(),
    documentName: Joi.string().allow(null, '').optional()
});

const externalRoleSchema = Joi.object({
    role: Joi.string().trim().required(),
    designation: Joi.string().trim().required(),
    services: Joi.array().items(Joi.string().trim()).default([]), // names, will map to IDs
    shifts: Joi.array().items(dayShiftSchema).min(1).required()
});

const externalCreateStaffSchema = Joi.object({
    storeId: Joi.string().uuid().optional(), // ignored; path param authoritative
    personal: externalPersonalSchema.required(),
    role: externalRoleSchema.required(),
    salary: externalSalarySchema.required(),
    commission: externalCommissionSchema.allow(null).optional(),
    bank: externalBankSchema.optional()
});

const externalUpdateStaffSchema = externalCreateStaffSchema.fork(['personal','role','salary'], (s) => s.optional());

// Main schemas to use
const createStaffSchema = externalCreateStaffSchema;
const updateStaffSchema = externalUpdateStaffSchema;

// Store ID validation schema
const storeIdSchema = Joi.object({
    storeId: Joi.string().uuid().required()
});

// Staff ID validation schema
const staffIdSchema = Joi.object({
    staffId: Joi.string().uuid().required()
});

// Combined store and staff ID validation schema
const storeStaffIdSchema = Joi.object({
    storeId: Joi.string().uuid().required(),
    staffId: Joi.string().uuid().required()
});

// Store + Service ID validation schema (for listing staff by service)
const storeServiceIdSchema = Joi.object({
    storeId: Joi.string().uuid().required(),
    serviceId: Joi.string().uuid().required()
});

module.exports = {
    createStaffSchema,
    updateStaffSchema,
    storeIdSchema,
    staffIdSchema,
    storeStaffIdSchema,
    storeServiceIdSchema
};
