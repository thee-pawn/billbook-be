const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { validate, validateParams } = require('../middleware/validation');
const { generalLimiter } = require('../middleware/rateLimiter');
const database = require('../config/database');
const gupshupService = require('../services/gupshupService');
const {
    sendSingleMessageSchema,
    sendBulkMessagesSchema,
    sendTemplateMessageSchema,
    sendBulkTemplateMessagesSchema,
    messageStatusSchema,
    storeIdSchema
} = require('../utils/messagingValidation');

/**
 * Send Single Message
 * POST /api/messaging/:storeId/send-single
 */
router.post('/:storeId/send-single',
    authenticateToken,
    generalLimiter,
    validateParams(storeIdSchema),
    validate(sendSingleMessageSchema),
    async (req, res) => {
        try {
            const { storeId } = req.params;
            const { recipient, message } = req.body;
            const userId = req.user.id;

            // Check if user has access to this store
            const storeAccess = await database.query(
                `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
                [storeId, userId]
            );

            if (storeAccess.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to access this store'
                });
            }

            // Only owners and managers can send messages
            if (!['owner', 'manager'].includes(storeAccess.rows[0].role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only owners and managers can send messages'
                });
            }

            // Validate and format phone number
            if (!gupshupService.validatePhoneNumber(recipient)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid phone number format'
                });
            }

            const formattedRecipient = gupshupService.formatPhoneNumber(recipient);

            // Send message
            const result = await gupshupService.sendTextMessage(formattedRecipient, message);

            if (result.success) {
                // Log message sending activity
                await database.query(
                    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at) 
                     VALUES ($1, 'MESSAGE_SENT', 'message', $2, $3, CURRENT_TIMESTAMP)`,
                    [
                        userId,
                        result.messageId,
                        JSON.stringify({
                            recipient: formattedRecipient,
                            messageLength: message.length,
                            storeId: storeId
                        })
                    ]
                );

                res.status(200).json({
                    success: true,
                    message: 'Message sent successfully',
                    data: {
                        messageId: result.messageId,
                        recipient: formattedRecipient,
                        status: 'sent'
                    }
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to send message',
                    error: result.error
                });
            }

        } catch (error) {
            console.error('Error sending single message:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send message'
            });
        }
    }
);

/**
 * Send Bulk Messages
 * POST /api/messaging/:storeId/send-bulk
 */
router.post('/:storeId/send-bulk',
    authenticateToken,
    generalLimiter,
    validateParams(storeIdSchema),
    validate(sendBulkMessagesSchema),
    async (req, res) => {
        try {
            const { storeId } = req.params;
            const { recipients, message } = req.body;
            const userId = req.user.id;

            // Check if user has access to this store
            const storeAccess = await database.query(
                `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
                [storeId, userId]
            );

            if (storeAccess.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to access this store'
                });
            }

            // Only owners and managers can send messages
            if (!['owner', 'manager'].includes(storeAccess.rows[0].role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only owners and managers can send messages'
                });
            }

            // Validate and format phone numbers
            const validRecipients = [];
            const invalidRecipients = [];

            recipients.forEach(recipient => {
                if (gupshupService.validatePhoneNumber(recipient)) {
                    validRecipients.push(gupshupService.formatPhoneNumber(recipient));
                } else {
                    invalidRecipients.push(recipient);
                }
            });

            if (validRecipients.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No valid phone numbers provided',
                    invalidRecipients
                });
            }

            // Send bulk messages
            const result = await gupshupService.sendBulkMessages(validRecipients, message);

            // Log bulk message sending activity
            await database.query(
                `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at) 
                 VALUES ($1, 'BULK_MESSAGE_SENT', 'message', $2, $3, CURRENT_TIMESTAMP)`,
                [
                    userId,
                    `bulk_${Date.now()}`,
                    JSON.stringify({
                        totalRecipients: recipients.length,
                        validRecipients: validRecipients.length,
                        invalidRecipients: invalidRecipients.length,
                        successful: result.successful,
                        failed: result.failed,
                        messageLength: message.length,
                        storeId: storeId
                    })
                ]
            );

            res.status(200).json({
                success: true,
                message: 'Bulk messages processed',
                data: {
                    summary: {
                        total: result.total,
                        successful: result.successful,
                        failed: result.failed,
                        invalidNumbers: invalidRecipients.length
                    },
                    details: result.details,
                    invalidRecipients
                }
            });

        } catch (error) {
            console.error('Error sending bulk messages:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send bulk messages'
            });
        }
    }
);

/**
 * Send Template Message
 * POST /api/messaging/:storeId/send-template
 */
router.post('/:storeId/send-template',
    authenticateToken,
    generalLimiter,
    validateParams(storeIdSchema),
    validate(sendTemplateMessageSchema),
    async (req, res) => {
        try {
            const { storeId } = req.params;
            const { recipient, templateId, params } = req.body;
            const userId = req.user.id;

            // Check if user has access to this store
            const storeAccess = await database.query(
                `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
                [storeId, userId]
            );

            if (storeAccess.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to access this store'
                });
            }

            // Only owners and managers can send messages
            if (!['owner', 'manager'].includes(storeAccess.rows[0].role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only owners and managers can send messages'
                });
            }

            // Validate and format phone number
            if (!gupshupService.validatePhoneNumber(recipient)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid phone number format'
                });
            }

            const formattedRecipient = gupshupService.formatPhoneNumber(recipient);

            // Send template message
            const result = await gupshupService.sendTemplateMessage(formattedRecipient, templateId, params);

            if (result.success) {
                // Log template message sending activity
                await database.query(
                    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at) 
                     VALUES ($1, 'TEMPLATE_MESSAGE_SENT', 'message', $2, $3, CURRENT_TIMESTAMP)`,
                    [
                        userId,
                        result.messageId,
                        JSON.stringify({
                            recipient: formattedRecipient,
                            templateId,
                            params,
                            storeId: storeId
                        })
                    ]
                );

                res.status(200).json({
                    success: true,
                    message: 'Template message sent successfully',
                    data: {
                        messageId: result.messageId,
                        recipient: formattedRecipient,
                        templateId,
                        status: 'sent'
                    }
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to send template message',
                    error: result.error
                });
            }

        } catch (error) {
            console.error('Error sending template message:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send template message'
            });
        }
    }
);

/**
 * Send Bulk Template Messages
 * POST /api/messaging/:storeId/send-bulk-template
 */
router.post('/:storeId/send-bulk-template',
    authenticateToken,
    generalLimiter,
    validateParams(storeIdSchema),
    validate(sendBulkTemplateMessagesSchema),
    async (req, res) => {
        try {
            const { storeId } = req.params;
            const { recipients, templateId, params } = req.body;
            const userId = req.user.id;

            // Check if user has access to this store
            const storeAccess = await database.query(
                `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
                [storeId, userId]
            );

            if (storeAccess.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to access this store'
                });
            }

            // Only owners and managers can send messages
            if (!['owner', 'manager'].includes(storeAccess.rows[0].role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only owners and managers can send messages'
                });
            }

            // Validate and format phone numbers
            const validRecipients = [];
            const invalidRecipients = [];

            recipients.forEach(recipient => {
                if (gupshupService.validatePhoneNumber(recipient)) {
                    validRecipients.push(gupshupService.formatPhoneNumber(recipient));
                } else {
                    invalidRecipients.push(recipient);
                }
            });

            if (validRecipients.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No valid phone numbers provided',
                    invalidRecipients
                });
            }

            // Send template messages to multiple recipients
            const results = {
                total: validRecipients.length,
                successful: 0,
                failed: 0,
                details: []
            };

            for (const recipient of validRecipients) {
                try {
                    const result = await gupshupService.sendTemplateMessage(recipient, templateId, params);
                    
                    if (result.success) {
                        results.successful++;
                        results.details.push({
                            recipient,
                            status: 'sent',
                            messageId: result.messageId
                        });
                    } else {
                        results.failed++;
                        results.details.push({
                            recipient,
                            status: 'failed',
                            error: result.error
                        });
                    }

                    // Add delay between messages to respect rate limits
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                } catch (error) {
                    results.failed++;
                    results.details.push({
                        recipient,
                        status: 'failed',
                        error: error.message
                    });
                }
            }

            // Log bulk template message sending activity
            await database.query(
                `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at) 
                 VALUES ($1, 'BULK_TEMPLATE_MESSAGE_SENT', 'message', $2, $3, CURRENT_TIMESTAMP)`,
                [
                    userId,
                    `bulk_template_${Date.now()}`,
                    JSON.stringify({
                        totalRecipients: recipients.length,
                        validRecipients: validRecipients.length,
                        invalidRecipients: invalidRecipients.length,
                        successful: results.successful,
                        failed: results.failed,
                        templateId,
                        params,
                        storeId: storeId
                    })
                ]
            );

            res.status(200).json({
                success: true,
                message: 'Bulk template messages processed',
                data: {
                    summary: {
                        total: results.total,
                        successful: results.successful,
                        failed: results.failed,
                        invalidNumbers: invalidRecipients.length
                    },
                    details: results.details,
                    invalidRecipients
                }
            });

        } catch (error) {
            console.error('Error sending bulk template messages:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send bulk template messages'
            });
        }
    }
);

/**
 * Get Message Status
 * GET /api/messaging/:storeId/status/:messageId
 */
router.get('/:storeId/status/:messageId',
    authenticateToken,
    validateParams(storeIdSchema),
    async (req, res) => {
        try {
            const { storeId, messageId } = req.params;
            const userId = req.user.id;

            // Check if user has access to this store
            const storeAccess = await database.query(
                `SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2`,
                [storeId, userId]
            );

            if (storeAccess.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to access this store'
                });
            }

            // Get message status from Gupshup
            const result = await gupshupService.getMessageStatus(messageId);

            if (result.success) {
                res.status(200).json({
                    success: true,
                    data: result.data
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to get message status',
                    error: result.error
                });
            }

        } catch (error) {
            console.error('Error getting message status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get message status'
            });
        }
    }
);

module.exports = router;
