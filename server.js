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

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        // Check if origin is in allowed list
        if (corsOrigins.includes('*') || corsOrigins.includes(origin)) {
            return callback(null, true);
        }

        console.log(`CORS blocked origin: ${origin}, allowed: ${corsOrigins.join(', ')}`);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Length', 'X-Request-ID']
}));

// Handle preflight requests
app.options('*', cors());

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
