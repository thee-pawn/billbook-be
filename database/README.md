# Database Migrations with Flyway

This directory contains database migration scripts managed using Flyway. Flyway provides version control for your database, allowing you to migrate from any version to the latest version of the database.

## Directory Structure

```
database/
├── migrations/
│   ├── flyway/
│   │   ├── V1__Initial_schema_setup.sql
│   │   ├── V2__Add_user_profile_fields.sql
│   │   ├── V3__Create_audit_log_table.sql
│   │   └── ... (future migrations)
│   └── flyway.conf
├── schema.sql (legacy, use migrations instead)
└── README.md
```

## Migration Naming Convention

Flyway uses a specific naming convention for migration files:

- **Versioned Migrations**: `V{version}__{description}.sql`
  - Example: `V1__Initial_schema_setup.sql`
  - Version numbers should be unique and sequential
  - Use double underscore (`__`) as separator
  - Description should be descriptive but concise

- **Repeatable Migrations**: `R__{description}.sql`
  - Example: `R__Create_views.sql`
  - Executed after all versioned migrations
  - Re-executed when their content changes

## Available Commands

### Using npm scripts (recommended):

```bash
# Run pending migrations
npm run db:migrate

# Get migration status and information
npm run db:info

# Clean database (removes all objects) - USE WITH CAUTION!
npm run db:clean
```

### Using Node.js directly:

```bash
# Run migrations
node migrate.js migrate

# Get migration information
node migrate.js info

# Clean database
node migrate.js clean
```

## Migration Workflow

### 1. Creating a New Migration

When you need to make database changes:

1. Create a new migration file with the next version number:
   ```
   V4__Add_billing_tables.sql
   ```

2. Write your SQL DDL/DML statements:
   ```sql
   -- V4__Add_billing_tables.sql
   CREATE TABLE invoices (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       user_id UUID NOT NULL REFERENCES users(id),
       amount DECIMAL(10,2) NOT NULL,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   );
   ```

3. Test the migration:
   ```bash
   npm run db:info    # Check current status
   npm run db:migrate # Apply the migration
   ```

### 2. Migration Best Practices

- **Always backup your database** before running migrations in production
- **Test migrations** in development environment first
- **Make migrations idempotent** when possible (use `IF NOT EXISTS`, etc.)
- **Don't modify existing migrations** once they've been applied
- **Use descriptive names** for migrations
- **Include rollback instructions** in comments if needed

### 3. Example Migration Templates

#### Creating a Table
```sql
-- V5__Create_products_table.sql
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
```

#### Adding a Column
```sql
-- V6__Add_product_category.sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
```

#### Creating an Index
```sql
-- V7__Add_user_email_index.sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_lower 
ON users(LOWER(email));
```

## Migration Status

You can check the status of your migrations using:

```bash
npm run db:info
```

This will show:
- ✅ Applied migrations (SUCCESS)
- ⏳ Pending migrations (PENDING) 
- ❌ Failed migrations (FAILED)

## Configuration

The Flyway configuration is stored in `database/migrations/flyway.conf`. Key settings:

- **Database URL**: `jdbc:postgresql://localhost:5432/bbplus`
- **Credentials**: Uses values from environment configuration
- **Migration Location**: `database/migrations/flyway/`
- **Schema**: `public`
- **Metadata Table**: `flyway_schema_history`

## Environment-Specific Migrations

For different environments, you can:

1. Use placeholders in migration files:
   ```sql
   INSERT INTO settings (key, value) VALUES ('env', '${environment}');
   ```

2. Create environment-specific migration scripts
3. Use different Flyway configuration files

## Troubleshooting

### Common Issues

1. **Migration fails with constraint error**
   - Check if data violates new constraints
   - Add data cleanup before adding constraints

2. **Migration marked as failed**
   - Fix the issue in the migration file
   - Use `npm run db:clean` (development only) and re-run
   - Or manually fix the flyway_schema_history table

3. **Out of order migrations**
   - Ensure version numbers are sequential
   - Check flyway.conf for `outOfOrder` setting

### Recovery Commands

```bash
# Check migration status
npm run db:info

# Clean database (development only!)
npm run db:clean

# Re-run all migrations
npm run db:migrate
```

## Production Deployment

1. **Backup the database** before deployment
2. **Test migrations** in staging environment
3. **Run migrations** as part of deployment process:
   ```bash
   NODE_ENV=production npm run db:migrate
   ```
4. **Verify application** works with new schema

## Current Schema Version

The current schema includes:

- **V1**: Initial schema (users, files, user_sessions tables)
- **V2**: User profile fields (role, profile_picture, verification tokens)
- **V3**: Audit logging table

Check `npm run db:info` for the latest applied version.
