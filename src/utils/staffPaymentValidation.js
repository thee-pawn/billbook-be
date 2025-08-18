const Joi = require('joi');

// Payment breakdown validation schema
const paymentBreakdownSchema = Joi.object({
    earnings: Joi.object({
        basic: Joi.number().min(0).default(0),
        hra: Joi.number().min(0).default(0),
        otherAllowances: Joi.number().min(0).default(0),
        commission: Joi.number().min(0).default(0),
        total: Joi.number().min(0).required()
    }).required(),
    deductions: Joi.object({
        epf: Joi.number().min(0).default(0),
        professionalTax: Joi.number().min(0).default(0),
        totalDeductions: Joi.number().min(0).required()
    }).required()
});

// Create staff payment validation schema
const createStaffPaymentSchema = Joi.object({
    staffId: Joi.string().uuid().required(),
    paymentPeriod: Joi.object({
        from: Joi.date().iso().required(),
        to: Joi.date().iso().min(Joi.ref('from')).required()
    }).required(),
    amount: Joi.number().min(0).precision(2).required(),
    accountNumber: Joi.string().trim().max(20).optional().allow(''),
    ifscCode: Joi.string().trim().length(11).pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional().allow(''),
    paymentBreakdown: paymentBreakdownSchema.required(),
    paymentMethod: Joi.string().valid('bank_transfer', 'cash', 'cheque', 'upi', 'neft', 'rtgs').optional(),
    paymentReference: Joi.string().trim().max(255).optional(),
    notes: Joi.string().trim().max(1000).optional()
});

// Update staff payment validation schema
const updateStaffPaymentSchema = Joi.object({
    paymentPeriod: Joi.object({
        from: Joi.date().iso().required(),
        to: Joi.date().iso().min(Joi.ref('from')).required()
    }).optional(),
    amount: Joi.number().min(0).precision(2).optional(),
    accountNumber: Joi.string().trim().max(20).optional().allow(''),
    ifscCode: Joi.string().trim().length(11).pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional().allow(''),
    paymentBreakdown: paymentBreakdownSchema.optional(),
    paymentStatus: Joi.string().valid('pending', 'processing', 'paid', 'failed', 'cancelled').optional(),
    paymentMethod: Joi.string().valid('bank_transfer', 'cash', 'cheque', 'upi', 'neft', 'rtgs').optional(),
    paymentReference: Joi.string().trim().max(255).optional(),
    paymentDate: Joi.date().iso().optional(),
    notes: Joi.string().trim().max(1000).optional()
});

// Update payment status validation schema
const updatePaymentStatusSchema = Joi.object({
    paymentStatus: Joi.string().valid('pending', 'processing', 'paid', 'failed', 'cancelled').required(),
    paymentMethod: Joi.string().valid('bank_transfer', 'cash', 'cheque', 'upi', 'neft', 'rtgs').optional(),
    paymentReference: Joi.string().trim().max(255).optional(),
    paymentDate: Joi.date().iso().optional(),
    notes: Joi.string().trim().max(1000).optional()
});

// Store ID validation schema
const storeIdSchema = Joi.object({
    storeId: Joi.string().uuid().required()
});

// Payment ID validation schema
const paymentIdSchema = Joi.object({
    paymentId: Joi.string().uuid().required()
});

// Store and payment ID validation schema
const storePaymentIdSchema = Joi.object({
    storeId: Joi.string().uuid().required(),
    paymentId: Joi.string().uuid().required()
});

// Staff payment query schema
const staffPaymentQuerySchema = Joi.object({
    staffId: Joi.string().uuid().optional(),
    status: Joi.string().valid('pending', 'processing', 'paid', 'failed', 'cancelled').optional(),
    paymentMethod: Joi.string().valid('bank_transfer', 'cash', 'cheque', 'upi', 'neft', 'rtgs').optional(),
    fromDate: Joi.date().iso().optional(),
    toDate: Joi.date().iso().min(Joi.ref('fromDate')).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10)
});

module.exports = {
    createStaffPaymentSchema,
    updateStaffPaymentSchema,
    updatePaymentStatusSchema,
    paymentBreakdownSchema,
    storeIdSchema,
    paymentIdSchema,
    storePaymentIdSchema,
    staffPaymentQuerySchema
};
