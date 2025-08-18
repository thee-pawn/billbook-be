<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Billbook Backend API - Copilot Instructions

This is a Node.js backend API project with the following key characteristics:

## Technology Stack
- **Framework**: Express.js
- **Database**: PostgreSQL with pg driver
- **File Storage**: AWS S3 with multer and multer-s3
- **Authentication**: JWT with bcryptjs
- **Validation**: Joi for input validation
- **Security**: Helmet, CORS, rate limiting

## Code Style & Patterns
- Use **CommonJS** module syntax (require/module.exports)
- Follow **async/await** pattern for asynchronous operations
- Use **database.query()** for PostgreSQL operations
- Implement proper **error handling** with try-catch and next()
- Use **middleware patterns** for authentication, validation, and rate limiting

## Database Patterns
- Use **UUID** primary keys
- Use **parameterized queries** ($1, $2, etc.) to prevent SQL injection
- Use **transactions** for multi-step operations with database.transaction()
- Follow **snake_case** naming for database columns
- Use **timestamps** (created_at, updated_at) for all tables

## File Structure Conventions
- **Routes** in src/routes/ with Express router
- **Middleware** in src/middleware/ for reusable logic
- **Services** in src/services/ for external integrations
- **Config** in src/config/ for environment settings
- **Controllers** in src/controllers/ for business logic

## Security Best Practices
- Always validate input with Joi schemas
- Use authentication middleware for protected routes
- Implement rate limiting for all endpoints
- Hash passwords with bcryptjs (12+ rounds)
- Use JWT tokens with proper expiration
- Validate file types and sizes for uploads

## API Response Format
Use consistent JSON response format:
```javascript
{
  success: boolean,
  message: string,
  data?: object,
  error?: string
}
```

## Environment Configuration
- Use config.js for environment-specific settings
- Support both development and production environments
- Load appropriate .env file based on NODE_ENV

## Error Handling
- Use central error handler middleware
- Provide meaningful error messages
- Log errors appropriately based on environment
- Handle database-specific errors (unique violations, foreign key constraints)

## S3 Integration
- Use s3Service for all S3 operations
- Implement proper file type validation
- Use signed URLs for private files
- Follow naming conventions for uploaded files
