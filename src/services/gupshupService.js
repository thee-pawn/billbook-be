const axios = require('axios');
const config = require('../config/config');

class GupshupService {
    constructor() {
        this.baseURL = 'https://api.gupshup.io/sm/api/v1';
        this.apiKey = config.gupshup.apiKey;
        this.appName = config.gupshup.appName;
    }

    /**
     * Send a simple text message to a single recipient
     * @param {string} destination - Phone number with country code (e.g., 919876543210)
     * @param {string} message - Text message to send
     * @returns {Promise<Object>} Response from Gupshup API
     */
    async sendTextMessage(destination, message) {
        try {
            const payload = {
                channel: 'whatsapp',
                source: this.appName,
                destination: destination,
                message: {
                    type: 'text',
                    text: message
                }
            };

            const response = await axios.post(`${this.baseURL}/msg`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': this.apiKey
                }
            });

            return {
                success: true,
                data: response.data,
                messageId: response.data.messageId
            };
        } catch (error) {
            console.error('Gupshup API Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Send messages to multiple recipients
     * @param {Array<string>} recipients - Array of phone numbers with country code
     * @param {string} message - Text message to send
     * @returns {Promise<Object>} Summary of sent messages
     */
    async sendBulkMessages(recipients, message) {
        const results = {
            total: recipients.length,
            successful: 0,
            failed: 0,
            details: []
        };

        // Send messages with a small delay to avoid rate limiting
        for (const recipient of recipients) {
            try {
                const result = await this.sendTextMessage(recipient, message);
                
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

        return results;
    }

    /**
     * Send a template message (for promotional/notification messages)
     * @param {string} destination - Phone number with country code
     * @param {string} templateId - Template ID from Gupshup
     * @param {Array} params - Template parameters
     * @returns {Promise<Object>} Response from Gupshup API
     */
    async sendTemplateMessage(destination, templateId, params = []) {
        try {
            const payload = {
                channel: 'whatsapp',
                source: this.appName,
                destination: destination,
                message: {
                    type: 'template',
                    template: {
                        id: templateId,
                        params: params
                    }
                }
            };

            const response = await axios.post(`${this.baseURL}/msg`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': this.apiKey
                }
            });

            return {
                success: true,
                data: response.data,
                messageId: response.data.messageId
            };
        } catch (error) {
            console.error('Gupshup Template API Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Get message status
     * @param {string} messageId - Message ID from Gupshup
     * @returns {Promise<Object>} Message status
     */
    async getMessageStatus(messageId) {
        try {
            const response = await axios.get(`${this.baseURL}/msg/${messageId}`, {
                headers: {
                    'apikey': this.apiKey
                }
            });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('Gupshup Status API Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Validate phone number format
     * @param {string} phoneNumber - Phone number to validate
     * @returns {boolean} True if valid format
     */
    validatePhoneNumber(phoneNumber) {
        // Remove any non-digit characters
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        
        // Check if it's a valid international format (10-15 digits)
        return /^\d{10,15}$/.test(cleanNumber);
    }

    /**
     * Format phone number for Gupshup API
     * @param {string} phoneNumber - Phone number to format
     * @returns {string} Formatted phone number
     */
    formatPhoneNumber(phoneNumber) {
        // Remove any non-digit characters
        let cleanNumber = phoneNumber.replace(/\D/g, '');
        
        // If it doesn't start with country code, assume India (+91)
        if (cleanNumber.length === 10) {
            cleanNumber = '91' + cleanNumber;
        }
        
        return cleanNumber;
    }
}

module.exports = new GupshupService();
