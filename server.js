const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const config = require('./src/config/config');
const database = require('./src/config/database');
const errorHandler = require('./src/middleware/errorHandler');
const { generalLimiter } = require('./src/middleware/rateLimiter');

// Import routes
const indexRoutes = require('./src/routes/index');
const authRoutes = require('./src/routes/auth');
const uploadRoutes = require('./src/routes/upload');

const app = express();

// Trust proxy (important for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// Compression middleware
app.use(compression());

// CORS configuration - use environment variable
const corsOrigins = config.corsOrigin ? config.corsOrigin.split(',').map(origin => origin.trim()) : ['*'];

// Debug logging
console.log('=== CORS Configuration Debug ===');
console.log('CORS_ORIGIN from env:', config.corsOrigin);
console.log('Parsed corsOrigins:', corsOrigins);
console.log('Node Environment:', config.nodeEnv);
console.log('================================');

app.use((req, res, next) => {
    console.log(`=== CORS Debug - ${req.method} ${req.path} ===`);
    console.log('Origin header:', req.get('Origin'));
    console.log('Host header:', req.get('Host'));
    console.log('Referer header:', req.get('Referer'));
    console.log('X-Forwarded-Host:', req.get('X-Forwarded-Host'));
    console.log('All headers:', JSON.stringify(req.headers, null, 2));
    next();
});

app.use(cors({
    origin: function (origin, callback) {
        console.log(`CORS origin function called with: "${origin}"`);
        console.log(`Available corsOrigins: [${corsOrigins.join(', ')}]`);

        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
            console.log('CORS: Allowing request with no origin');
            return callback(null, true);
        }

        // Check if origin is in allowed list
        if (corsOrigins.includes('*') || corsOrigins.includes(origin)) {
            console.log(`CORS: Allowing origin "${origin}"`);
            return callback(null, true);
        }

        console.log(`CORS BLOCKED - Origin: "${origin}", Allowed: [${corsOrigins.join(', ')}]`);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Length', 'X-Request-ID']
}));

// Add response debugging middleware
app.use((req, res, next) => {
    const originalSend = res.send;
    const originalJson = res.json;

    res.send = function(data) {
        console.log(`=== Response Headers Debug - ${req.method} ${req.path} ===`);
        console.log('Access-Control-Allow-Origin:', res.get('Access-Control-Allow-Origin'));
        console.log('Access-Control-Allow-Methods:', res.get('Access-Control-Allow-Methods'));
        console.log('Access-Control-Allow-Headers:', res.get('Access-Control-Allow-Headers'));
        console.log('Access-Control-Allow-Credentials:', res.get('Access-Control-Allow-Credentials'));
        console.log('All response headers:', res.getHeaders());
        console.log('===========================================');
        return originalSend.call(this, data);
    };

    res.json = function(data) {
        console.log(`=== Response Headers Debug - ${req.method} ${req.path} ===`);
        console.log('Access-Control-Allow-Origin:', res.get('Access-Control-Allow-Origin'));
        console.log('Access-Control-Allow-Methods:', res.get('Access-Control-Allow-Methods'));
        console.log('Access-Control-Allow-Headers:', res.get('Access-Control-Allow-Headers'));
        console.log('Access-Control-Allow-Credentials:', res.get('Access-Control-Allow-Credentials'));
        console.log('All response headers:', res.getHeaders());
        console.log('===========================================');
        return originalJson.call(this, data);
    };

    next();
});

// Logging middleware
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(generalLimiter);

// API routes
app.use(`/api/${config.apiVersion}`, indexRoutes);
app.use(`/api/${config.apiVersion}/auth`, authRoutes);
app.use(`/api/${config.apiVersion}/upload`, uploadRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Billbook Backend API',
    version: config.apiVersion,
    environment: config.nodeEnv,
    timestamp: new Date().toISOString()
  });
});

// Debug CORS endpoint
app.get('/debug-cors', (req, res) => {
  res.json({
    success: true,
    debug: {
      origin: req.get('Origin'),
      referer: req.get('Referer'),
      host: req.get('Host'),
      corsOrigins: config.corsOrigin ? config.corsOrigin.split(',').map(origin => origin.trim()) : ['*'],
      headers: req.headers
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start the server
const PORT = config.port;

// Initialize database and start server
async function startServer() {
  try {
    // No need to explicitly connect to database as the connection pool is already set up in the Database class constructor
    console.log('Database connection pool initialized');

    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running in ${config.nodeEnv} mode on port ${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api/${config.apiVersion}`);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down server...');

      // Close database connection pool
      if (database.pool) {
        await database.pool.end();
        console.log('Database connection pool closed');
      }

      console.log('Server shutdown complete');
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (config.nodeEnv !== 'test') {
  startServer();
}

module.exports = app;
