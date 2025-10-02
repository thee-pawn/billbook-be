const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const config = require('./src/config/config');
const database = require('./src/config/database');
const errorHandler = require('./src/middleware/errorHandler');
const { generalLimiter } = require('./src/middleware/rateLimiter');

// Create Express app
const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());

// ===== Minimal CORS (Step 1) =====
const allowedOrigins = [
  'https://www.billbookplus.com',
  'https://billbookplus.com',
  'https://main.d331ydh68dzthe.amplifyapp.com'
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow same-site / curl
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS'));
  },
  credentials: true
}));
// Ensure caches/proxies vary on Origin
app.use((req, res, next) => { res.header('Vary', 'Origin'); next(); });
// Optional explicit preflight fast path
app.options('*', (req, res) => res.sendStatus(204));
// ===== End Minimal CORS =====

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
const indexRoutes = require('./src/routes/index');
const authRoutes = require('./src/routes/auth');
const uploadRoutes = require('./src/routes/upload');
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
