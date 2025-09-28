#!/usr/bin/env node

// Debug environment variables loading
const dotenv = require('dotenv');
const path = require('path');

console.log('🔍 Debugging environment variables...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Current working directory:', process.cwd());

// Load environment variables the same way as config.js
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
const envPath = path.join(__dirname, envFile);

console.log('Looking for env file at:', envPath);
console.log('File exists:', require('fs').existsSync(envPath));

if (require('fs').existsSync(envPath)) {
  console.log('File contents:');
  console.log(require('fs').readFileSync(envPath, 'utf8'));
}

const result = dotenv.config({ path: envPath });
console.log('Dotenv result:', result);

console.log('\n📋 Database environment variables:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '[SET]' : '[NOT SET]');