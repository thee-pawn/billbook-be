const Joi = require('joi');

// Send single message validation schema
const sendSingleMessageSchema = Joi.object({
    recipient: Joi.string().trim().required(),
    message: Joi.string().trim().min(1).max(4096).required()
});

// Send bulk messages validation schema
const sendBulkMessagesSchema = Joi.object({
    recipients: Joi.array()
        .items(Joi.string().trim().required())
        .min(1)
        .max(100) // Limit to 100 recipients per request
        .required(),
    message: Joi.string().trim().min(1).max(4096).required()
});

// Send template message validation schema
const sendTemplateMessageSchema = Joi.object({
    recipient: Joi.string().trim().required(),
    templateId: Joi.string().trim().required(),
    params: Joi.array().items(Joi.string()).optional().default([])
});

// Send bulk template messages validation schema
const sendBulkTemplateMessagesSchema = Joi.object({
    recipients: Joi.array()
        .items(Joi.string().trim().required())
        .min(1)
        .max(100)
        .required(),
    templateId: Joi.string().trim().required(),
    params: Joi.array().items(Joi.string()).optional().default([])
});

// Get message status validation schema
const messageStatusSchema = Joi.object({
    messageId: Joi.string().trim().required()
});

// Store ID validation (for path params)
const storeIdSchema = Joi.object({
    storeId: Joi.string().uuid().required()
});

module.exports = {
    sendSingleMessageSchema,
    sendBulkMessagesSchema,
    sendTemplateMessageSchema,
    sendBulkTemplateMessagesSchema,
    messageStatusSchema,
    storeIdSchema
};
