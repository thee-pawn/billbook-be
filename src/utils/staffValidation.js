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

// New external (frontend) payload variants
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
    ifsc: Joi.string().alphanum().min(6).max(15).allow(null, '').optional(), // relaxed vs internal schema and allow null
    bankName: Joi.string().trim().allow(null, '').optional(),
    branch: Joi.string().trim().allow(null, '').optional()
});

const externalPersonalSchema = Joi.object({
    name: Joi.string().trim().min(2).max(255).required(),
    gender: Joi.string().trim().required(),
    phone: Joi.string().trim().pattern(/^[0-9]{10,15}$/).required(),
    email: Joi.string().email().optional(),
    dateOfBirth: Joi.date().iso().optional(),
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
    commission: externalCommissionSchema.optional(),
    bank: externalBankSchema.optional()
});

// Legacy flat create schema (kept for backward compatibility)
const legacyCreateStaffSchema = Joi.object({
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
    bankName: Joi.string().trim().max(255).optional(),
    services: Joi.array().items(Joi.string().uuid()).optional()
});

// Nested create schema
const nestedCreateStaffSchema = Joi.object({
    personal: Joi.object({
        name: Joi.string().trim().min(2).max(255).required(),
        contact: Joi.string().trim().pattern(/^[0-9]{10,15}$/).required(),
        gender: Joi.string().valid('male', 'female', 'other').required(),
        email: Joi.string().email().optional(),
        doj: Joi.date().iso().required(),
        dob: Joi.date().iso().optional()
    }).required(),
    employment: Joi.object({
        designation: Joi.string().trim().max(100).required(),
        role: Joi.string().trim().max(50).required(),
        shifts: shiftsSchema.required(),
        services: Joi.array().items(Joi.string().uuid()).default([])
    }).required(),
    compensation: Joi.object({
        salary: salarySchema.required(),
        commission: commissionSchema.optional()
    }).required(),
    documents: Joi.object({
        documentId: Joi.string().trim().optional(),
        photoId: Joi.string().trim().optional()
    }).default({}),
    banking: Joi.object({
        accountNumber: Joi.string().trim().max(20).optional(),
        ifscCode: Joi.string().trim().length(11).pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(),
        bankingName: Joi.string().trim().max(255).optional(),
        bankName: Joi.string().trim().max(255).optional()
    }).default({})
});

const createStaffSchema = Joi.alternatives().try(legacyCreateStaffSchema, nestedCreateStaffSchema, externalCreateStaffSchema);

// Legacy update schema
const legacyUpdateStaffSchema = Joi.object({
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
    bankName: Joi.string().trim().max(255).optional(),
    services: Joi.array().items(Joi.string().uuid()).optional()
});

// Nested update schema
const nestedUpdateStaffSchema = Joi.object({
    personal: Joi.object({
        name: Joi.string().trim().min(2).max(255).optional(),
        contact: Joi.string().trim().pattern(/^[0-9]{10,15}$/).optional(),
        gender: Joi.string().valid('male', 'female', 'other').optional(),
        email: Joi.string().email().optional(),
        doj: Joi.date().iso().optional(),
        dob: Joi.date().iso().optional()
    }).optional(),
    employment: Joi.object({
        designation: Joi.string().trim().max(100).optional(),
        role: Joi.string().trim().max(50).optional(),
        shifts: shiftsSchema.optional(),
        services: Joi.array().items(Joi.string().uuid()).optional()
    }).optional(),
    compensation: Joi.object({
        salary: salarySchema.optional(),
        commission: commissionSchema.optional()
    }).optional(),
    documents: Joi.object({
        documentId: Joi.string().trim().optional(),
        photoId: Joi.string().trim().optional()
    }).optional(),
    banking: Joi.object({
        accountNumber: Joi.string().trim().max(20).optional(),
        ifscCode: Joi.string().trim().length(11).pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(),
        bankingName: Joi.string().trim().max(255).optional(),
        bankName: Joi.string().trim().max(255).optional()
    }).optional(),
    status: Joi.string().valid('active', 'inactive', 'terminated').optional()
});

// External update allows same structure but all optional
const externalUpdateStaffSchema = externalCreateStaffSchema.fork(['personal','role','salary'], (s) => s.optional());
const updateStaffSchema = Joi.alternatives().try(legacyUpdateStaffSchema, nestedUpdateStaffSchema, externalUpdateStaffSchema);

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
    shiftsSchema,
    salarySchema,
    commissionSchema
};
module.exports.storeServiceIdSchema = storeServiceIdSchema;
