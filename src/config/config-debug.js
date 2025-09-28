const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
const envPath = path.join(__dirname, '..', '..', envFile);

console.log('🔧 Loading environment from:', envPath);
console.log('📁 File exists:', fs.existsSync(envPath));

if (fs.existsSync(envPath)) {
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.error('❌ Error loading .env file:', result.error);
  } else {
    console.log('✅ Environment variables loaded successfully');
    console.log('📊 Variables loaded:', Object.keys(result.parsed || {}).length);
  }
} else {
  console.log('⚠️  Environment file not found, using system environment variables');
}

// Parse comma-separated CORS origins from env
function parseOrigins(input) {
  if (!input) return null;
  return input
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

const corsOrigins = parseOrigins(process.env.CORS_ORIGINS);

module.exports = {
  // Server Configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || 'v1',
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  corsOrigins: corsOrigins,

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

// Debug output (only in production for troubleshooting)
if (process.env.NODE_ENV === 'production') {
  console.log('🔍 Database config loaded:', {
    host: module.exports.database.host,
    port: module.exports.database.port,
    database: module.exports.database.name,
    user: module.exports.database.user,
    password: module.exports.database.password ? '[SET]' : '[NOT SET]',
    ssl: module.exports.database.ssl
  });
}