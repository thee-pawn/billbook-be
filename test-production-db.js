#!/usr/bin/env node

// Alternative config loading for production
require('dotenv').config(); // Load from .env file

// Override with production-specific environment variables if they exist
if (process.env.NODE_ENV === 'production') {
  // Try to load production-specific env file
  try {
    require('dotenv').config({ path: '.env.production', override: true });
  } catch (error) {
    console.log('No .env.production file found, using system environment variables');
  }
}

// Test database configuration
const config = {
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'bbplus',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.NODE_ENV === 'production'
  }
};

console.log('Final database config:', {
  ...config.database,
  password: config.database.password ? '[SET]' : '[NOT SET]'
});

// Test connection
const { Pool } = require('pg');
const pool = new Pool(config.database);

pool.query('SELECT NOW()')
  .then(result => {
    console.log('✅ Database connection successful!');
    console.log('Current time:', result.rows[0].now);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  });