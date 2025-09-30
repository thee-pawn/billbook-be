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

// CORS configuration with allowlist
const allowedOrigins = config.corsOrigins || (config.corsOrigin ? [config.corsOrigin] : ['*']);
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Allow all origins if wildcard is set
    if (allowedOrigins.includes('*')) return callback(null, true);

    // Check exact match
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Check for AWS Amplify domains (*.amplifyapp.com)
    const isAmplifyDomain = /^https:\/\/[a-zA-Z0-9-]+\.amplifyapp\.com$/.test(origin);
    if (isAmplifyDomain) return callback(null, true);

    // Check for localhost with any port (development)
    const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
    if (isLocalhost && (config.nodeEnv === 'development' || allowedOrigins.some(o => o.includes('localhost') || o.includes('127.0.0.1')))) {
      return callback(null, true);
    }

    // Check for wildcard patterns in allowed origins
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin.includes('*')) {
        const pattern = allowedOrigin.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(origin);
      }
      return false;
    });

    if (isAllowed) return callback(null, true);

    // Log the blocked origin for debugging
    console.log(`CORS: Blocked origin - ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Preflight handling
app.options('*', cors());

// Compression middleware
app.use(compression());

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
