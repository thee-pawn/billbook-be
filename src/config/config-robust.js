require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Function to try loading environment from multiple possible paths
function loadEnvironment() {
    const possiblePaths = [
        path.join(process.cwd(), '.env.production'),
        path.join(__dirname, '../../.env.production'),
        '/home/ec2-user/billbook-be/.env.production',
        '.env.production'
    ];

    console.log('🔧 Attempting to load production environment...');
    
    for (const envPath of possiblePaths) {
        console.log(`📁 Checking: ${envPath}`);
        if (fs.existsSync(envPath)) {
            console.log(`✅ Found environment file at: ${envPath}`);
            require('dotenv').config({ path: envPath });
            console.log(`🎯 Loaded ${Object.keys(process.env).filter(key => 
                ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'].includes(key)
            ).length} database environment variables`);
            return true;
        }
    }
    
    console.log('⚠️  No .env.production file found in any expected location');
    return false;
}

// Try to load environment file for production
if (process.env.NODE_ENV === 'production') {
    const loaded = loadEnvironment();
    if (!loaded) {
        console.log('🔄 Falling back to system environment variables');
    }
}

const config = {
    // Server configuration
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // Database configuration
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'billbook',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.NODE_ENV === 'production' ? 
             (process.env.DB_SSL === 'false' ? false : true) : false
    },
    
    // JWT configuration
    jwt: {
        secret: process.env.JWT_SECRET || 'your-fallback-secret-key',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    },
    
    // AWS configuration
    aws: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'ap-south-1',
        s3Bucket: process.env.S3_BUCKET
    },
    
    // Security configuration
    bcrypt: {
        rounds: parseInt(process.env.BCRYPT_ROUNDS) || 12
    },
    
    // Rate limiting configuration
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
    }
};

// Debug output for production
if (process.env.NODE_ENV === 'production') {
    console.log('🔍 Final database config:');
    console.log({
        host: config.database.host,
        port: config.database.port,
        database: config.database.database,
        user: config.database.user,
        password: config.database.password ? '[SET]' : '[NOT SET]',
        ssl: config.database.ssl
    });
}

module.exports = config;