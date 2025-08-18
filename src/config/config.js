const dotenv = require('dotenv');
const path = require('path');

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.join(__dirname, '..', '..', envFile) });

module.exports = {
  // Server Configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || 'v1',
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'bbplus',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.NODE_ENV === 'production'
  },

  // AWS S3 Configuration
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    s3BucketName: process.env.S3_BUCKET_NAME
  },

  // Local S3 Configuration (for development)
  localS3: {
    enabled: process.env.USE_LOCAL_S3 === 'true' || process.env.NODE_ENV === 'development',
    port: parseInt(process.env.LOCAL_S3_PORT) || 4569,
    directory: process.env.LOCAL_S3_DIRECTORY || path.join(__dirname, '../../.local-s3'),
    endpointUrl: process.env.LOCAL_S3_ENDPOINT || 'http://localhost:4569',
    forcePathStyle: true,
    createBucketOnStart: true,
    accessKeyId: 'S3RVER', // Default for local development
    secretAccessKey: 'S3RVER', // Default for local development
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  // Rate Limiting Configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000 // Increased from 100 to 1000
  },

  // Twilio Configuration
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID
  },

  // Gupshup Configuration
  gupshup: {
    apiKey: process.env.GUPSHUP_API_KEY,
    appName: process.env.GUPSHUP_APP_NAME || 'billbook'
  }
};
