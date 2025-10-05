// OTP Service using 2factor API
const config = require('../config/config');
const https = require('https');
const { URL } = require('url');

class OtpService {
    constructor() {
        this.twoFactorEnabled = config.twofactor?.apiKey && !config.twofactor.apiKey.includes('your_api_key');
        this.apiKey = config.twofactor?.apiKey;
        this.baseUrl = 'https://2factor.in/API/V1';

        if (this.twoFactorEnabled) {
            console.log('✅ 2factor OTP service initialized');
        } else {
            console.log('⚠️ 2factor OTP service disabled - using simulation mode');
        }
    }

    // Make HTTP request to 2factor API
    async makeRequest(url) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);

            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Billbook-API/1.0'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        resolve(response);
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }

    // Send OTP using 2factor API
    async sendOtp(phoneNumber) {
        try {
            if (this.twoFactorEnabled) {
                // Format phone number for 2factor API (remove + and country code handling)
                const formattedPhone = this.formatPhoneFor2Factor(phoneNumber);

                // 2factor API URL: https://2factor.in/API/V1/{api_key}/SMS/{phone_number}/AUTOGEN/OTP1
                const url = `${this.baseUrl}/${this.apiKey}/SMS/${formattedPhone}/AUTOGEN/OTP1`;

                console.log(`📱 Sending OTP to ${formattedPhone} via 2factor API`);

                const response = await this.makeRequest(url);

                if (response.Status === 'Success') {
                    console.log(`📱 OTP sent successfully via 2factor. Session ID: ${response.Details}`);

                    return {
                        success: true,
                        message: 'OTP sent successfully',
                        sessionId: response.Details,
                        details: response.Details
                    };
                } else {
                    console.error('2factor API error:', response);
                    throw new Error(response.Details || 'Failed to send OTP');
                }
            } else {
                // Simulation mode for development
                const otp = this.generateOtp();
                console.log(`📱 OTP simulation mode: Generated OTP ${otp} for ${phoneNumber}`);

                return {
                    success: true,
                    message: 'OTP sent successfully (simulation)',
                    sessionId: 'sim_' + Date.now(),
                    simulatedOtp: otp // Only in development
                };
            }
        } catch (error) {
            console.error('OTP sending failed:', error);

            if (this.twoFactorEnabled) {
                console.error('2factor API Error:', {
                    message: error.message,
                    url: error.url
                });
            }

            throw new Error('Failed to send OTP');
        }
    }

    // Verify OTP using 2factor API
    async verifyOtp(phoneNumber, otp) {
        try {
            if (this.twoFactorEnabled) {
                // Format phone number for 2factor API
                const formattedPhone = this.formatPhoneFor2Factor(phoneNumber);

                // 2factor API URL: https://2factor.in/API/V1/{api_key}/SMS/VERIFY3/{phone_number}/{otp}
                const url = `${this.baseUrl}/${this.apiKey}/SMS/VERIFY3/${formattedPhone}/${otp}`;

                console.log(`🔐 Verifying OTP for ${formattedPhone} via 2factor API`);

                const response = await this.makeRequest(url);

                const isValid = response.Status === 'Success';

                console.log(`🔐 OTP verification ${isValid ? 'successful' : 'failed'} for ${phoneNumber}`);

                return {
                    success: isValid,
                    status: isValid ? 'approved' : 'denied',
                    message: response.Details || 'OTP verification completed'
                };
            } else {
                // For development, accept any 6-digit OTP
                const isValidFormat = /^\d{6}$/.test(otp);
                console.log(`🔐 OTP verification (simulated): ${isValidFormat ? 'successful' : 'failed'} for ${phoneNumber}`);

                return {
                    success: isValidFormat,
                    status: isValidFormat ? 'approved' : 'denied',
                    message: isValidFormat ? 'OTP verified (simulation)' : 'Invalid OTP format'
                };
            }
        } catch (error) {
            console.error('OTP verification failed:', error);

            if (this.twoFactorEnabled) {
                console.error('2factor API Error:', {
                    message: error.message
                });
            }

            return {
                success: false,
                status: 'denied',
                error: error.message,
                message: 'OTP verification failed'
            };
        }
    }

    // Format phone number for 2factor API
    formatPhoneFor2Factor(phoneNumber) {
        // Remove any non-digit characters
        const cleaned = phoneNumber.replace(/\D/g, '');

        // 2factor expects format like: 919999999999 (country code + number)
        // If it's an Indian number (10 digits) and doesn't start with country code
        if (cleaned.length === 10 && !cleaned.startsWith('91')) {
            return `91${cleaned}`;
        }

        // If it already has country code (12 digits starting with 91)
        if (cleaned.startsWith('91') && cleaned.length === 12) {
            return cleaned;
        }

        // If it starts with +91, remove the +
        if (phoneNumber.startsWith('+91')) {
            return cleaned;
        }

        // Default: add 91 for Indian numbers
        return `91${cleaned}`;
    }

    // Format phone number to international format (for display/storage)
    formatPhoneNumber(phoneNumber) {
        // Remove any non-digit characters
        const cleaned = phoneNumber.replace(/\D/g, '');
    
        // If it's an Indian number (10 digits) and doesn't start with country code
        if (cleaned.length === 10 && !cleaned.startsWith('91')) {
            return `+91${cleaned}`;
        }
    
        // If it already has country code
        if (cleaned.startsWith('91') && cleaned.length === 12) {
            return `+${cleaned}`;
        }
    
        // If it already starts with +, return as is
        if (phoneNumber.startsWith('+')) {
            return phoneNumber;
        }
    
        // Default: add +91 for Indian numbers
        return `+91${cleaned}`;
    }

    // Generate a 6-digit OTP for simulation/development
    generateOtp() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // Validate OTP format
    isValidOtpFormat(otp) {
        return /^\d{6}$/.test(otp);
    }

    // Check if OTP has expired (2factor handles this automatically)
    isOtpExpired(expiresAt) {
        return new Date() > new Date(expiresAt);
    }

    // Generate a secure random token for password reset
    generateSecureToken() {
        const crypto = require('crypto');
        return crypto.randomBytes(32).toString('hex');
    }

    // Get service status
    getServiceStatus() {
        return {
            provider: '2factor',
            enabled: this.twoFactorEnabled,
            mode: this.twoFactorEnabled ? 'production' : 'simulation'
        };
    }
}

module.exports = new OtpService();
