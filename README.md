# Billbook Backend API

A Node.js backend server with PostgreSQL database, AWS S3 file storage, and JWT authentication.

## Features

- ✅ **Express.js** server with middleware
- ✅ **PostgreSQL** database integration
- ✅ **AWS S3** file upload and management
- ✅ **JWT Authentication** with bcrypt password hashing
- ✅ **Rate Limiting** and security middleware
- ✅ **Input Validation** with Joi
- ✅ **Environment-based Configuration** (development/production)
- ✅ **Error Handling** and logging
- ✅ **CORS** and **Helmet** security
- ✅ **File Upload** with Multer and S3

## Prerequisites

- Node.js (>= 14.0.0)
- PostgreSQL database
- AWS S3 bucket and credentials

## Installation

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   # Copy the example file
   cp .env.example .env.development
   cp .env.example .env.production
   
   # Edit the files with your actual values
   ```

3. **Configure your environment files:**

   **`.env.development`:**
   ```env
   NODE_ENV=development
   PORT=3000
   
   # Database
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=billbook_dev
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password
   
   # AWS S3
   AWS_ACCESS_KEY_ID=your_aws_access_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key
   AWS_REGION=us-east-1
   S3_BUCKET_NAME=billbook-dev-bucket
   
   # JWT
   JWT_SECRET=your_jwt_secret_dev_key_here
   JWT_EXPIRES_IN=7d
   ```

4. **Set up the database:**
   ```bash
   # Create PostgreSQL database
   createdb billbook_dev
   
   # Run migrations
   npm run db:migrate
   ```

## Database Migrations

This project uses a custom Node.js migration system compatible with Flyway naming conventions.

### Migration Commands

```bash
# Run all pending migrations
npm run db:migrate

# Check migration status and info
npm run db:info

# Clean database (removes all objects) - USE WITH CAUTION!
npm run db:clean
```

### Migration Files

Migration files are located in `database/migrations/flyway/` and follow this naming pattern:
- `V{version}__{description}.sql` (e.g., `V1__Create_users_table.sql`)
- Files are executed in version order
- Each migration is tracked in the `flyway_schema_history` table

### Creating New Migrations

1. **Determine next version number** by checking existing files in `database/migrations/flyway/`
2. **Create new file** with naming pattern: `V{next_version}__{description}.sql`
3. **Write your SQL** following PostgreSQL syntax
4. **Run migration**: `npm run db:migrate`

### Example Migration

```sql
-- V6__Add_user_preferences.sql
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    theme VARCHAR(20) DEFAULT 'light',
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
```

### Migration Best Practices

- **Always test** migrations on development database first
- **Use transactions** for complex migrations
- **Create indexes** for performance
- **Add constraints** carefully (consider existing data)
- **Use UUID** primary keys following project conventions
- **Include rollback plan** for production deployments

### Current Migrations

- `V1__Create_users_table.sql` - Initial users table
- `V3__Make_password_nullable.sql` - Password field update
- `V4__Update_status_logged_in_to_active.sql` - Status field update
- `V5__Create_stores_table.sql` - Stores table creation
- `V6__Create_store_users_table.sql` - Store-user relationship table
- `V7__Create_shifts_table.sql` - Regular store operating hours by day
- `V8__Create_special_shifts_table.sql` - Special store hours for specific dates

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm run prod
```

### Testing
```bash
npm test
npm run test:watch
```

### Code Quality
```bash
npm run lint
npm run lint:fix
npm run format
```

## API Testing

### Postman Collections

The project includes comprehensive Postman collections for API testing:

1. **Complete API Collection**: `BillBook_API_Collection.postman_collection.json`
   - All authentication and core APIs
   - Environment: `BillBook_Development.postman_environment.json`

2. **Store Management Collection**: `Billbook_Store_Management.postman_collection.json`
   - Store CRUD operations
   - Store user management APIs
   - Environment: `Billbook_Store_Management.postman_environment.json`

### How to Use Postman Collections

1. **Import Collections:**
   - Open Postman
   - Click "Import" and select the collection files
   - Import both collection and environment files

2. **Set Environment:**
   - Select the appropriate environment from the dropdown
   - Update `base_url` if your server runs on a different port

3. **Authentication Flow:**
   - Run "User Login" from the Authentication folder
   - The auth token will be automatically saved to environment variables
   - All subsequent requests will use this token

4. **Testing Store APIs:**
   - Create a store using "Create Store"
   - Copy the store ID from response and set as `store_id` environment variable
   - Test other store operations and user management

## API Endpoints

### Health & Info
- `GET /` - Root endpoint
- `GET /api/v1/health` - Health check with service status
- `GET /api/v1/info` - API information

### Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login

### Stores
- `POST /api/v1/stores` - Create new store (authenticated)
- `GET /api/v1/stores` - Get all user's stores (authenticated, paginated)
- `GET /api/v1/stores/:storeId` - Get single store (authenticated)
- `PUT /api/v1/stores/:storeId` - Update store (authenticated, owner/manager only)

### Store User Management
- `POST /api/v1/stores/:storeId/users` - Add user to store (authenticated, owner/manager only)
- `GET /api/v1/stores/:storeId/users` - Get store users (authenticated, paginated)
- `PUT /api/v1/stores/:storeId/users/:userId` - Update user role in store (authenticated, owner/manager only)
- `DELETE /api/v1/stores/:storeId/users/:userId` - Remove user from store (authenticated, owner/manager only)

### Shift Management
- `POST /api/v1/stores/:storeId/shifts` - Create regular shift (authenticated, owner/manager only)
- `GET /api/v1/stores/:storeId/shifts` - Get all store shifts (authenticated)
- `GET /api/v1/stores/:storeId/shifts/:shiftId` - Get specific shift (authenticated)
- `PUT /api/v1/stores/:storeId/shifts/:shiftId` - Update shift (authenticated, owner/manager only)
- `DELETE /api/v1/stores/:storeId/shifts/:shiftId` - Delete shift (authenticated, owner/manager only)

### Special Shift Management
- `POST /api/v1/stores/:storeId/special-shifts` - Create special shift (authenticated, owner/manager only)
- `GET /api/v1/stores/:storeId/special-shifts` - Get all special shifts (authenticated, paginated, date filtering)
- `GET /api/v1/stores/:storeId/special-shifts/:specialShiftId` - Get specific special shift (authenticated)
- `PUT /api/v1/stores/:storeId/special-shifts/:specialShiftId` - Update special shift (authenticated, owner/manager only)
- `DELETE /api/v1/stores/:storeId/special-shifts/:specialShiftId` - Delete special shift (authenticated, owner/manager only)

### File Upload
- `POST /api/v1/upload/single` - Upload single file
- `POST /api/v1/upload/multiple` - Upload multiple files
- `DELETE /api/v1/upload/:key` - Delete file
- `GET /api/v1/upload/signed-url/:key` - Get signed URL
- `GET /api/v1/upload/list` - List files

## Project Structure

```
billbook-be/
├── src/
│   ├── config/
│   │   ├── config.js         # Environment configuration
│   │   └── database.js       # Database connection
│   ├── controllers/          # Route controllers
│   ├── middleware/
│   │   ├── auth.js          # JWT authentication
│   │   ├── errorHandler.js  # Error handling
│   │   ├── rateLimiter.js   # Rate limiting
│   │   └── validation.js    # Input validation
│   ├── models/              # Database models
│   ├── routes/
│   │   ├── index.js         # Health and info routes
│   │   ├── auth.js          # Authentication routes
│   │   └── upload.js        # File upload routes
│   ├── services/
│   │   └── s3Service.js     # AWS S3 service
│   └── utils/               # Utility functions
├── tests/                   # Test files
├── database/
│   └── schema.sql          # Database schema
├── .env.development        # Development environment
├── .env.production         # Production environment
├── .env.example           # Environment template
├── server.js              # Main server file
└── package.json
```

## Environment Configuration

The application supports two environments:
- **Development**: Uses `.env.development`
- **Production**: Uses `.env.production`

Environment is determined by the `NODE_ENV` variable.

## Security Features

- **Helmet.js** for security headers
- **CORS** configuration
- **Rate limiting** (general, auth, upload)
- **JWT token** authentication
- **Bcrypt** password hashing
- **Input validation** with Joi
- **File type** and size validation

## Database Schema

The application includes a PostgreSQL schema with:
- **Users table** with UUID primary keys
- **Files table** for tracking uploads
- **User sessions table** (optional)
- **Indexes** for performance
- **Triggers** for automatic timestamps

## AWS S3 Integration

Features:
- File upload with automatic naming
- File type and size validation
- Public and private file support
- Signed URLs for secure access
- File deletion
- File listing

## Error Handling

Comprehensive error handling for:
- Database errors
- JWT errors
- Multer upload errors
- AWS S3 errors
- Validation errors

## Rate Limiting

Different rate limits for:
- **General API**: 100 requests per 15 minutes
- **Authentication**: 5 requests per 15 minutes
- **File Upload**: 10 requests per 15 minutes

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

ISC
