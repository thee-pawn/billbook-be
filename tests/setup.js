// Jest setup file
// This file runs before each test

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'billbook_test';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';

// Increase timeout for database operations
jest.setTimeout(10000);
