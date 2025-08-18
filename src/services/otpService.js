// OTP Service using Twilio Verify API
const twilio = require('twilio');
const config = require('../config/config');

class OtpService {
    constructor() {
        // Debug: Log the credentials being loaded (hide sensitive parts)
        console.log('🔍 Debug - Loading Twilio credentials:');
        console.log('Account SID:', config.twilio.accountSid ? `${config.twilio.accountSid.substring(0, 10)}...` : 'NOT SET');
        console.log('Auth Token:', config.twilio.authToken ? `${config.twilio.authToken.substring(0, 8)}...` : 'NOT SET');
        console.log('Verify Service SID:', config.twilio.verifyServiceSid ? `${config.twilio.verifyServiceSid.substring(0, 10)}...` : 'NOT SET');
        
        // Initialize Twilio client only if credentials are properly configured
        if (config.twilio.accountSid &&
            config.twilio.authToken &&
            config.twilio.accountSid.startsWith('AC') &&
            config.twilio.authToken.length > 10 &&
            !config.twilio.accountSid.includes('your_twilio')) {
      
            this.twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
            this.twilioEnabled = true;
            console.log('✅ Twilio Verify service initialized successfully');
        } else {
            this.twilioEnabled = false;
            console.warn('⚠️  Twilio credentials not properly configured. SMS will be simulated.');
            console.warn('📝 To enable Twilio SMS, set proper TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN in your .env file');
        }
    }

    // Send OTP using Twilio Verify API
    async sendOtp(phoneNumber) {
        try {
            if (this.twilioEnabled && config.twilio.verifyServiceSid && !config.twilio.verifyServiceSid.includes('your_twilio')) {
                // Format phone number for international format
                const formattedPhone = this.formatPhoneNumber(phoneNumber);
        
                const verification = await this.twilioClient.verify.v2
                    .services(config.twilio.verifyServiceSid)
                    .verifications
                    .create({
                        to: formattedPhone,
                        channel: 'sms'
                    });

                console.log(`📱 OTP sent successfully via Twilio Verify. SID: ${verification.sid}`);
        
                return {
                    success: true,
                    message: 'OTP sent successfully',
                    verificationSid: verification.sid
                };
            } else {
                // Fallback to simulation for development
                const otp = this.generateOtp();
                console.log(`📱 SMS Simulation: Sending OTP ${otp} to ${phoneNumber}`);
                console.log(`💡 For testing, use any 6-digit number as OTP`);
        
                return {
                    success: true,
                    message: 'OTP sent successfully (simulated)',
                    simulatedOtp: otp // Only for development
                };
            }
        } catch (error) {
            console.error('SMS sending failed:', error);
      
            if (this.twilioEnabled) {
                console.error('Twilio Error Details:', {
                    code: error.code,
                    message: error.message,
                    moreInfo: error.moreInfo
                });
            }
      
            throw new Error('Failed to send OTP');
        }
    }

    // Verify OTP using Twilio Verify API
    async verifyOtp(phoneNumber, otp) {
        try {
            if (this.twilioEnabled && config.twilio.verifyServiceSid && !config.twilio.verifyServiceSid.includes('your_twilio')) {
                const formattedPhone = this.formatPhoneNumber(phoneNumber);
        
                const verificationCheck = await this.twilioClient.verify.v2
                    .services(config.twilio.verifyServiceSid)
                    .verificationChecks
                    .create({
                        to: formattedPhone,
                        code: otp
                    });

                const isValid = verificationCheck.status === 'approved';
        
                console.log(`🔐 OTP verification ${isValid ? 'successful' : 'failed'} for ${phoneNumber}`);
        
                return {
                    success: isValid,
                    status: verificationCheck.status
                };
            } else {
                // For development, accept any 6-digit OTP
                const isValidFormat = /^\d{6}$/.test(otp);
                console.log(`🔐 OTP verification (simulated): ${isValidFormat ? 'successful' : 'failed'} for ${phoneNumber}`);
        
                return {
                    success: isValidFormat,
                    status: isValidFormat ? 'approved' : 'denied'
                };
            }
        } catch (error) {
            console.error('OTP verification failed:', error);
      
            if (this.twilioEnabled) {
                console.error('Twilio Verify Error:', {
                    code: error.code,
                    message: error.message
                });
            }
      
            return {
                success: false,
                status: 'denied',
                error: error.message
            };
        }
    }



    // Format phone number to international format
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

    // Check if OTP has expired
    isOtpExpired(expiresAt) {
        return new Date() > new Date(expiresAt);
    }

    // Generate a secure random token for password reset
    generateSecureToken() {
        const crypto = require('crypto');
        return crypto.randomBytes(32).toString('hex');
    }
}

module.exports = new OtpService();
