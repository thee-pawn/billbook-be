const Joi = require('joi');

// Shifts validation schema
const shiftsSchema = Joi.object({
    workingDays: Joi.array().items(
        Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
    ).required(),
    workingHoursStart: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    workingHoursEnd: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required()
});

// Salary validation schema
const salarySchema = Joi.object({
    earnings: Joi.object({
        basic: Joi.number().min(0).required(),
        hra: Joi.number().min(0).default(0),
        otherAllowances: Joi.number().min(0).default(0)
    }).required(),
    deductions: Joi.object({
        professionalTax: Joi.number().min(0).default(0),
        epf: Joi.number().min(0).default(0)
    }).default({})
});

// Commission rate validation schema
const commissionRateSchema = Joi.object({
    type: Joi.string().valid('products', 'services', 'memberships').required(),
    commissionType: Joi.string().valid('percentage', 'fixed').required(),
    minRevenue: Joi.number().min(0).required(),
    maxRevenue: Joi.number().min(Joi.ref('minRevenue')).required(),
    commission: Joi.number().min(0).required()
});

// Commission validation schema
const commissionSchema = Joi.object({
    commissionType: Joi.string().valid('percentage', 'fixed').required(),
    commissionCycle: Joi.string().valid('monthly', 'weekly').required(),
    commissionRates: Joi.array().items(commissionRateSchema).min(1).required()
});

// Create staff validation schema
const createStaffSchema = Joi.object({
    name: Joi.string().trim().min(2).max(255).required(),
    contact: Joi.string().trim().pattern(/^[0-9]{10,15}$/).required(),
    gender: Joi.string().valid('male', 'female', 'other').required(),
    email: Joi.string().email().optional(),
    doj: Joi.date().iso().required(),
    dob: Joi.date().iso().optional(),
    designation: Joi.string().trim().max(100).required(),
    role: Joi.string().trim().max(50).required(),
    shifts: shiftsSchema.required(),
    documentId: Joi.string().trim().optional(),
    photoId: Joi.string().trim().optional(),
    salary: salarySchema.required(),
    commission: commissionSchema.optional(),
    accountNumber: Joi.string().trim().max(20).optional(),
    ifscCode: Joi.string().trim().length(11).pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(),
    bankingName: Joi.string().trim().max(255).optional(),
    bankName: Joi.string().trim().max(255).optional()
});

// Update staff validation schema (all fields optional except store validation)
const updateStaffSchema = Joi.object({
    name: Joi.string().trim().min(2).max(255).optional(),
    contact: Joi.string().trim().pattern(/^[0-9]{10,15}$/).optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    email: Joi.string().email().optional(),
    doj: Joi.date().iso().optional(),
    dob: Joi.date().iso().optional(),
    designation: Joi.string().trim().max(100).optional(),
    role: Joi.string().trim().max(50).optional(),
    shifts: shiftsSchema.optional(),
    documentId: Joi.string().trim().optional(),
    photoId: Joi.string().trim().optional(),
    salary: salarySchema.optional(),
    commission: commissionSchema.optional(),
    status: Joi.string().valid('active', 'inactive', 'terminated').optional(),
    accountNumber: Joi.string().trim().max(20).optional(),
    ifscCode: Joi.string().trim().length(11).pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(),
    bankingName: Joi.string().trim().max(255).optional(),
    bankName: Joi.string().trim().max(255).optional()
});

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

module.exports = {
    createStaffSchema,
    updateStaffSchema,
    storeIdSchema,
    staffIdSchema,
    storeStaffIdSchema,
    shiftsSchema,
    salarySchema,
    commissionSchema
};
