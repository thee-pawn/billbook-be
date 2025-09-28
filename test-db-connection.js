#!/usr/bin/env node

// Test database connection with current environment
const config = require('./src/config/config');
const database = require('./src/config/database');

async function testConnection() {
  console.log('🔧 Testing database connection...');
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Database config:', {
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    ssl: config.database.ssl
  });

  try {
    const result = await database.query('SELECT NOW() as current_time, version() as postgres_version');
    console.log('✅ Database connection successful!');
    console.log('Current time:', result.rows[0].current_time);
    console.log('PostgreSQL version:', result.rows[0].postgres_version.split(' ')[0]);
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();