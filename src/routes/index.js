const express = require('express');
const router = express.Router();
const config = require('../config/config');
const database = require('../config/database');
const s3Service = require('../services/s3Service');

// Import route modules
const authRoutes = require('./auth');
const uploadRoutes = require('./upload');
const storeRoutes = require('./stores');
const shiftRoutes = require('./shifts');
const productsRoutes = require('./products');
const servicesRoutes = require('./services');
const receiptSettingsRoutes = require('./receiptSettings');
const membershipsRoutes = require('./memberships');
const servicePackagesRoutes = require('./servicePackages');
const loyaltyPointsConfigurationRoutes = require('./loyaltyPointsConfiguration');
const couponsRoutes = require('./coupons');
const customersRoutes = require('./customers');
const reviewsRoutes = require('./reviews');
const expensesRoutes = require('./expenses');
const staffRoutes = require('./staff');
const attendanceRoutes = require('./attendance');
const messagingRoutes = require('./messaging');
const staffPaymentsRoutes = require('./staffPayments');

// Mount all route modules
router.use('/auth', authRoutes);
router.use('/stores', storeRoutes);
router.use('/stores', shiftRoutes);
router.use('/services', servicesRoutes);
router.use('/products', productsRoutes);
router.use('/upload', uploadRoutes);
router.use('/receipt-settings', receiptSettingsRoutes);
router.use('/memberships', membershipsRoutes);
router.use('/service-packages', servicePackagesRoutes);
router.use('/loyalty-points-configuration', loyaltyPointsConfigurationRoutes);
router.use('/coupons', couponsRoutes);
router.use('/customers', customersRoutes);
router.use('/reviews', reviewsRoutes);
router.use('/expenses', expensesRoutes);
router.use('/staff', staffRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/messaging', messagingRoutes);
router.use('/staff-payments', staffPaymentsRoutes);

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      version: config.apiVersion,
      services: {
        database: false,
        s3: false
      }
    };

    // Test database connection
    try {
      await database.testConnection();
      health.services.database = true;
    } catch (error) {
      health.services.database = false;
    }

    // Test S3 connection
    try {
      await s3Service.testConnection();
      health.services.s3 = true;
    } catch (error) {
      health.services.s3 = false;
    }

    const statusCode = (health.services.database && health.services.s3) ? 200 : 503;
    
    res.status(statusCode).json({
      success: true,
      data: health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message
    });
  }
});

// API info endpoint
router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Billbook Backend API',
      version: config.apiVersion,
      environment: config.nodeEnv,
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/api/health',
        info: '/api/info',
        auth: '/api/auth',
        upload: '/api/upload'
      }
    }
  });
});

module.exports = router;
