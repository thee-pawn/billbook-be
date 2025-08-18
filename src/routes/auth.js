const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { validate, schemas } = require('../middleware/validation');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const database = require('../config/database');
const otpService = require('../services/otpService');
const tokenBlacklistService = require('../services/tokenBlacklistService');

// User Registration
router.post('/register', authLimiter, validate(schemas.userRegistration), async (req, res, next) => {
  try {
    const { name, phoneNumber, email } = req.body;

    // Check if user already exists with this phone number or email
    const existingUserPhone = await database.query(
      'SELECT id, status, name, email FROM users WHERE phone_number = $1',
      [phoneNumber]
    );

    const existingUserEmail = await database.query(
      'SELECT id, status, name, phone_number FROM users WHERE email = $1',
      [email]
    );

    // Handle existing user with same phone number
    if (existingUserPhone.rows.length > 0) {
      const user = existingUserPhone.rows[0];
      
      // If user is active (has completed registration with password), decline
      if (user.status === 'ACTIVE') {
        return res.status(409).json({
          success: false,
          message: 'User with this phone number already exists and is active'
        });
      }
      
      // If user is in OTP_GENERATED or VERIFIED status (password not set), overwrite
      if (user.status === 'OTP_GENERATED' || user.status === 'VERIFIED') {
        console.log(`📝 Overwriting existing user with phone ${phoneNumber} in status: ${user.status}`);
        
        // Update existing user with new details
        const result = await database.query(
          `UPDATE users 
           SET name = $1, email = $2, status = 'OTP_GENERATED', password = NULL, updated_at = NOW() 
           WHERE phone_number = $3
           RETURNING id, name, phone_number, email, status, created_at`,
          [name, email, phoneNumber]
        );

        const updatedUser = result.rows[0];

        // Send OTP using Twilio Verify
        await otpService.sendOtp(phoneNumber);

        return res.status(200).json({
          success: true,
          message: 'User registration updated successfully. OTP sent to phone number.',
          data: {
            userId: updatedUser.id,
            phoneNumber: phoneNumber,
            status: 'OTP_GENERATED',
            action: 'updated'
          }
        });
      }
    }

    // Handle existing user with same email (but different phone)
    if (existingUserEmail.rows.length > 0) {
      const user = existingUserEmail.rows[0];
      
      // If user is active (has completed registration with password), decline
      if (user.status === 'ACTIVE') {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists and is active'
        });
      }
      
      // If user is in OTP_GENERATED or VERIFIED status (password not set), overwrite
      if (user.status === 'OTP_GENERATED' || user.status === 'VERIFIED') {
        console.log(`📝 Overwriting existing user with email ${email} in status: ${user.status}`);
        
        // Update existing user with new details
        const result = await database.query(
          `UPDATE users 
           SET name = $1, phone_number = $2, status = 'OTP_GENERATED', password = NULL, updated_at = NOW() 
           WHERE email = $3
           RETURNING id, name, phone_number, email, status, created_at`,
          [name, phoneNumber, email]
        );

        const updatedUser = result.rows[0];

        // Send OTP using Twilio Verify
        await otpService.sendOtp(phoneNumber);

        return res.status(200).json({
          success: true,
          message: 'User registration updated successfully. OTP sent to phone number.',
          data: {
            userId: updatedUser.id,
            phoneNumber: phoneNumber,
            status: 'OTP_GENERATED',
            action: 'updated'
          }
        });
      }
    }

    // Create new user if no conflicts
    const result = await database.query(
      `INSERT INTO users (name, phone_number, email, status, created_at, updated_at) 
       VALUES ($1, $2, $3, 'OTP_GENERATED', NOW(), NOW()) 
       RETURNING id, name, phone_number, email, status, created_at`,
      [name, phoneNumber, email]
    );

    const user = result.rows[0];

    // Send OTP using Twilio Verify
    await otpService.sendOtp(phoneNumber);

    res.status(201).json({
      success: true,
      message: 'User registered successfully. OTP sent to phone number.',
      data: {
        userId: user.id,
        phoneNumber: phoneNumber,
        status: 'OTP_GENERATED',
        action: 'created'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Verify OTP for Registration
router.post('/register/otp/verify', authLimiter, validate(schemas.otpVerification), async (req, res, next) => {
  try {
    const { phoneNumber, otp } = req.body;

    // Verify OTP using Twilio Verify
    const verificationResult = await otpService.verifyOtp(phoneNumber, otp);

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Find user by phone number and update status
    const userResult = await database.query(
      'SELECT id, name, phone_number, email FROM users WHERE phone_number = $1',
      [phoneNumber]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Update user status to verified
    await database.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      ['VERIFIED', user.id]
    );

    // Generate auth token
    const token = generateToken({
      id: user.id,
      phone: user.phone_number,
      name: user.name
    });

    res.json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        userId: user.id,
        authToken: token,
        status: 'VERIFIED'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Set Password (after OTP verification)
router.post('/register/password-set', authenticateToken, validate(schemas.setPassword), async (req, res, next) => {
  try {
    const { userId, password } = req.body;

    // Verify user exists and is verified
    const userResult = await database.query(
      'SELECT id, status FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    if (user.status !== 'VERIFIED') {
      return res.status(400).json({
        success: false,
        message: 'User must be verified before setting password'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Update user with password and status
    await database.query(
      'UPDATE users SET password = $1, status = $2, updated_at = NOW() WHERE id = $3',
      [hashedPassword, 'ACTIVE', userId]
    );

    res.json({
      success: true,
      message: 'Password set successfully',
      data: {
        userId: userId,
        status: 'ACTIVE'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', authLimiter, validate(schemas.userLogin), async (req, res, next) => {
  try {
    const { phone, password } = req.body;

    // Find user by phone
    const result = await database.query(
      'SELECT id, name, phone_number, password, email, is_mfa_enabled, status FROM users WHERE phone_number = $1',
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone number or password'
      });
    }

    const user = result.rows[0];

    // Check if user has set a password
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'Password not set. Please complete registration first.'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone number or password'
      });
    }

    // Check if MFA is enabled
    if (user.is_mfa_enabled) {
      // Send OTP using Twilio Verify API
      await otpService.sendOtp(phone);

      return res.json({
        success: true,
        message: 'MFA enabled. OTP sent to your phone.',
        data: {
          userId: user.id,
          phoneNumber: phone,
          status: 'OTP_GENERATED'
        }
      });
    }

    // Update user status to logged in
    await database.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      ['ACTIVE', user.id]
    );

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      phone: user.phone_number,
      name: user.name
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        userId: user.id,
        authToken: token,
        status: 'ACTIVE'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Verify OTP for MFA Login
router.post('/otp/verify', authLimiter, validate(schemas.otpVerification), async (req, res, next) => {
  try {
    const { phoneNumber, otp } = req.body;

    // Find user by phone number
    const userResult = await database.query(
      'SELECT id, name, phone_number, email FROM users WHERE phone_number = $1',
      [phoneNumber]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Verify OTP using Twilio Verify
    const verificationResult = await otpService.verifyOtp(phoneNumber, otp);

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Update user status to active
    await database.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      ['ACTIVE', user.id]
    );

    // Generate auth token
    const token = generateToken({
      id: user.id,
      phone: user.phone_number,
      name: user.name
    });

    res.json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        userId: user.id,
        authToken: token,
        status: 'ACTIVE'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Send Login OTP (for passwordless login or MFA)
router.post('/login/otp/send', authLimiter, validate(schemas.forgotPassword), async (req, res, next) => {
  try {
    const { phone } = req.body;

    // Find user by phone number
    const userResult = await database.query(
      'SELECT id, name, phone_number, status FROM users WHERE phone_number = $1',
      [phone]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this phone number'
      });
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (user.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'User account is not active. Please complete registration first.'
      });
    }

    // Send OTP using Twilio Verify
    await otpService.sendOtp(phone);

    res.json({
      success: true,
      message: 'Login OTP sent successfully',
      data: {
        userId: user.id,
        phoneNumber: phone
      }
    });
  } catch (error) {
    next(error);
  }
});

// Verify Login OTP
router.post('/login/otp/verify', authLimiter, validate(schemas.otpVerification), async (req, res, next) => {
  try {
    const { phoneNumber, otp } = req.body;

    // Find user by phone number
    const userResult = await database.query(
      'SELECT id, name, phone_number, email, status FROM users WHERE phone_number = $1',
      [phoneNumber]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Verify OTP using Twilio Verify
    const verificationResult = await otpService.verifyOtp(phoneNumber, otp);

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Update user status to active
    await database.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      ['ACTIVE', user.id]
    );

    // Generate auth token
    const token = generateToken({
      id: user.id,
      phone: user.phone_number,
      name: user.name
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        authToken: token,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone_number,
          email: user.email
        },
        status: 'ACTIVE'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Resend OTP
router.post('/otp/resend', authLimiter, validate(schemas.resendOtp), async (req, res, next) => {
  try {
      const { userId, attempts } = req.body;
      
      if(attempts >= 3) {
        return res.status(429).json({
          success: false,
          message: 'Too many attempts. Please try again later.'
        });
      }

    // Check if user exists
    const userResult = await database.query(
      'SELECT phone_number FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const phoneNumber = userResult.rows[0].phone_number;

    // Send OTP
    await otpService.sendOtp(phoneNumber);

    res.json({
      success: true,
      message: 'OTP resent successfully',
      data: {
        userId: userId,
        status: 'OTP_GENERATED'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Enable MFA
router.post('/enable-mfa', authenticateToken, validate(schemas.enableMfa), async (req, res, next) => {
  try {
    const { userId } = req.body;

    // Update user MFA status
    await database.query(
      'UPDATE users SET is_mfa_enabled = true, updated_at = NOW() WHERE id = $1',
      [userId]
    );

    res.json({
      success: true,
      message: 'MFA enabled successfully',
      data: {
        userId: userId,
        status: 'MFA_ENABLED'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Set Password (standalone)
router.post('/password-set', authenticateToken, validate(schemas.setPassword), async (req, res, next) => {
  try {
    const { userId, password } = req.body;

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Update user password
    await database.query(
      'UPDATE users SET password = $1, status = $2, updated_at = NOW() WHERE id = $3',
      [hashedPassword, 'PASSWORD_RESET', userId]
    );

    res.json({
      success: true,
      message: 'Password set successfully',
      data: {
        userId: userId,
        status: 'PASSWORD_RESET'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Forgot Password
router.post('/forgot-password', authLimiter, validate(schemas.forgotPassword), async (req, res, next) => {
  try {
    const { phone } = req.body;

    // Find user by phone
    const userResult = await database.query(
      'SELECT id FROM users WHERE phone_number = $1',
      [phone]
    );

    if (userResult.rows.length === 0) {
      // Don't reveal if user exists or not for security
      return res.json({
        success: true,
        message: 'If this phone number is registered, you will receive an OTP shortly.'
      });
    }

    // Send OTP
    await otpService.sendOtp(phone);

    res.json({
      success: true,
      message: 'If this phone number is registered, you will receive an OTP shortly.'
    });
  } catch (error) {
    next(error);
  }
});

// Reset Password
router.post('/reset-password', authenticateToken, authLimiter, validate(schemas.resetPassword), async (req, res, next) => {
  try {
    const { userId, oldPassword, password } = req.body;

    // Get current user password from database
    const userResult = await database.query(
      'SELECT password FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Check if user has a password set
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'No existing password found. Please use forgot password flow.'
      });
    }

    // Verify old password
    const isValidOldPassword = await bcrypt.compare(oldPassword, user.password);

    if (!isValidOldPassword) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Update user password
    await database.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, userId]
    );

    res.json({
      success: true,
      message: 'Password reset successfully',
      data: {
        userId: userId,
        status: 'PASSWORD_RESET'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get User Profile
router.get('/profile', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get user details from database
    const userResult = await database.query(
      'SELECT id, name, phone_number, email, is_mfa_enabled, status, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Generate a fresh auth token
    const token = generateToken({
      id: user.id,
      phone: user.phone_number,
      name: user.name
    });

    res.json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone_number,
          email: user.email,
          isMfaEnabled: user.is_mfa_enabled,
          status: user.status,
          createdAt: user.created_at,
          updatedAt: user.updated_at
        },
        authToken: token
      }
    });
  } catch (error) {
    next(error);
  }
});

// Logout
router.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const token = req.token; // Token is now available from the middleware

    // Blacklist the current token
    tokenBlacklistService.blacklistToken(token);

    // Update user status
    await database.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      ['ACTIVE', userId]
    );

    res.json({
      success: true,
      message: 'Logged out successfully. Token has been invalidated.'
    });
  } catch (error) {
    next(error);
  }
});

// Logout from all devices (invalidate all user tokens)
router.post('/logout-all', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Note: This is a simplified approach. In production, you might want to:
    // 1. Store user token issued timestamps in database
    // 2. Check tokens against issue time during authentication
    // 3. Or maintain user-specific token lists in Redis
    
    // For now, we'll update the user's updated_at time and advise frontend
    // to clear all stored tokens
    await database.query(
      'UPDATE users SET updated_at = NOW() WHERE id = $1',
      [userId]
    );

    res.json({
      success: true,
      message: 'Logged out from all devices. All tokens should be cleared.',
      data: {
        logoutTimestamp: new Date().toISOString(),
        advice: 'Clear all stored tokens on client side'
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
