const config = require('../config/config');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error with request context
  const context = {
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    query: req.query,
    userId: req.user?.id,
    message: err.message,
  };
  if (config.logLevel === 'debug' || config.nodeEnv === 'development') {
    // Avoid logging full sensitive bodies
    try {
      const bodyPreview = req.body && Object.keys(req.body).length ? '[BODY_PRESENT]' : '[NO_BODY]';
      console.error('Error Details:', { ...context, body: bodyPreview, stack: err.stack });
    } catch (_) {
      console.error('Error Details:', context, err);
    }
  } else {
    console.error('Error:', context);
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401 };
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File too large';
    error = { message, statusCode: 400 };
  }

  // PostgreSQL errors
  if (err.code === '23505') { // Unique violation
    const message = 'Duplicate entry';
    error = { message, statusCode: 409 };
  }

  if (err.code === '23503') { // Foreign key violation
    const message = 'Referenced record does not exist';
    error = { message, statusCode: 400 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error',
    ...(config.nodeEnv === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
