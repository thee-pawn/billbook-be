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

// Manual CORS implementation to force headers
app.use((req, res, next) => {
    const origin = req.get('Origin');
    console.log(`=== Manual CORS Handler - ${req.method} ${req.path} ===`);
    console.log('Origin header:', origin);
    console.log('Available corsOrigins:', corsOrigins);

    // Check if origin is allowed
    const isOriginAllowed = !origin || corsOrigins.includes('*') || corsOrigins.includes(origin);

    if (isOriginAllowed) {
        // Force set CORS headers
        res.header('Access-Control-Allow-Origin', origin || '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Max-Age', '86400');

        console.log('CORS headers set manually:', {
            'Access-Control-Allow-Origin': origin || '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
            'Access-Control-Allow-Credentials': 'true'
        });

        // Handle preflight OPTIONS requests
        if (req.method === 'OPTIONS') {
            console.log('Handling OPTIONS preflight request');
            return res.status(204).end();
        }
    } else {
        console.log('CORS BLOCKED - Origin not allowed:', origin);
        return res.status(403).json({ error: 'CORS not allowed' });
    }

    next();
});

// Additional middleware to ensure CORS headers are always present
app.use((req, res, next) => {
    const origin = req.get('Origin');
    const isOriginAllowed = !origin || corsOrigins.includes('*') || corsOrigins.includes(origin);

    if (isOriginAllowed) {
        // Override any existing CORS headers that might be set later
        const originalEnd = res.end;
        res.end = function(chunk, encoding) {
            // Force set CORS headers right before sending response
            res.header('Access-Control-Allow-Origin', origin || '*');
            res.header('Access-Control-Allow-Credentials', 'true');
            console.log('Final CORS headers forced before response:', {
                'Access-Control-Allow-Origin': origin || '*',
                'Access-Control-Allow-Credentials': 'true'
            });
            originalEnd.call(this, chunk, encoding);
        };
    }

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
