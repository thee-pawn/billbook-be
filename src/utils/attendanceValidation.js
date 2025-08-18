const Joi = require('joi');

// Punch in validation schema
const punchInSchema = Joi.object({
    staffId: Joi.string().uuid().required()
});

// Punch out validation schema  
const punchOutSchema = Joi.object({
    staffId: Joi.string().uuid().required()
});

// Request leave validation schema
const requestLeaveSchema = Joi.object({
    staffId: Joi.string().uuid().required(),
    date: Joi.date().iso().required(),
    leaveType: Joi.string().valid(
        'sick_leave', 
        'casual_leave', 
        'personal_leave', 
        'emergency_leave',
        'annual_leave',
        'maternity_leave',
        'paternity_leave'
    ).required(),
    leaveReason: Joi.string().trim().max(500).optional()
});

// Approve leave validation schema
const approveLeaveSchema = Joi.object({
    staffId: Joi.string().uuid().required(),
    date: Joi.date().iso().required(),
    approved: Joi.boolean().required() // true for approve, false for reject
});

// Get attendance status validation schema
const attendanceStatusSchema = Joi.object({
    staffId: Joi.string().uuid().required(),
    date: Joi.date().iso().optional(), // If not provided, use current date
    startDate: Joi.date().iso().optional(), // For date range queries
    endDate: Joi.date().iso().optional()
}).with('startDate', 'endDate'); // Both start and end date required together

// Store ID validation (for path params)
const storeIdSchema = Joi.object({
    storeId: Joi.string().uuid().required()
});

// Staff ID validation (for path params)
const staffIdSchema = Joi.object({
    staffId: Joi.string().uuid().required()
});

module.exports = {
    punchInSchema,
    punchOutSchema,
    requestLeaveSchema,
    approveLeaveSchema,
    attendanceStatusSchema,
    storeIdSchema,
    staffIdSchema
};
