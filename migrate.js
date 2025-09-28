const fs = require('fs');
const path = require('path');
const database = require('./src/config/database');

class DatabaseMigrator {
  constructor() {
    this.migrationsDir = path.join(__dirname, 'database/migrations/flyway');
    this.metadataTable = 'flyway_schema_history';
  }

  async ensureMetadataTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${this.metadataTable} (
        installed_rank INTEGER NOT NULL,
        version VARCHAR(50),
        description VARCHAR(200) NOT NULL,
        type VARCHAR(20) NOT NULL,
        script VARCHAR(1000) NOT NULL,
        checksum INTEGER,
        installed_by VARCHAR(100) NOT NULL,
        installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        execution_time INTEGER NOT NULL,
        success BOOLEAN NOT NULL,
        PRIMARY KEY (installed_rank)
      );
      
      CREATE INDEX IF NOT EXISTS ${this.metadataTable}_s_idx ON ${this.metadataTable} (success);
    `;
    
    await database.query(createTableQuery);
  }

  async getAppliedMigrations() {
    await this.ensureMetadataTable();
    
    const result = await database.query(
      `SELECT version, description, installed_on, success 
       FROM ${this.metadataTable} 
       WHERE success = true 
       ORDER BY installed_rank`
    );
    
    return result.rows;
  }

  async getMigrationFiles() {
    const files = fs.readdirSync(this.migrationsDir)
      .filter(file => file.match(/^V\d+__.+\.sql$/));
    
    const migrations = files.map(file => {
      const match = file.match(/^V(\d+)__(.+)\.sql$/);
      return {
        version: match[1],
        description: match[2].replace(/_/g, ' '),
        filename: file,
        filepath: path.join(this.migrationsDir, file)
      };
    });
    
    // Sort by version number (numerically, not alphabetically)
    return migrations.sort((a, b) => parseInt(a.version) - parseInt(b.version));
  }

  async getPendingMigrations() {
    const allMigrations = await this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();
    
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));
    
    return allMigrations.filter(migration => !appliedVersions.has(migration.version));
  }

  async executeMigration(migration) {
    const startTime = Date.now();
    let success = false;
    
    try {
      console.log(`� Executing migration: V${migration.version} - ${migration.description}`);
      
      const sql = fs.readFileSync(migration.filepath, 'utf8');
      
      // Execute the migration in a transaction
      await database.transaction(async (client) => {
        await client.query(sql);
        
        // Record the migration
        const executionTime = Date.now() - startTime;
        await client.query(
          `INSERT INTO ${this.metadataTable} 
           (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success)
           VALUES ((SELECT COALESCE(MAX(installed_rank), 0) + 1 FROM ${this.metadataTable}), $1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            migration.version,
            migration.description,
            'SQL',
            migration.filename,
            this.calculateChecksum(sql),
            'system',
            executionTime,
            true
          ]
        );
      });
      
      success = true;
      console.log(`   ✅ Migration completed in ${Date.now() - startTime}ms`);
      
    } catch (error) {
      console.error(`   ❌ Migration failed: ${error.message}`);
      
      // Record the failed migration
      try {
        const executionTime = Date.now() - startTime;
        await database.query(
          `INSERT INTO ${this.metadataTable} 
           (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success)
           VALUES ((SELECT COALESCE(MAX(installed_rank), 0) + 1 FROM ${this.metadataTable}), $1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            migration.version,
            migration.description,
            'SQL',
            migration.filename,
            this.calculateChecksum(fs.readFileSync(migration.filepath, 'utf8')),
            'system',
            executionTime,
            false
          ]
        );
      } catch (recordError) {
        console.error(`Failed to record migration failure: ${recordError.message}`);
      }
      
      throw error;
    }
    
    return success;
  }

  calculateChecksum(content) {
    // Simple checksum calculation
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  async migrate() {
    try {
      console.log('🚀 Starting database migration...');
      console.log('=====================================');

      const pendingMigrations = await this.getPendingMigrations();
      
      if (pendingMigrations.length === 0) {
        console.log('✅ No pending migrations found. Database is up to date!');
        return { success: true, migrationsExecuted: 0 };
      }

      console.log(`📋 Found ${pendingMigrations.length} pending migration(s):`);
      pendingMigrations.forEach(migration => {
        console.log(`   ⏳ V${migration.version} - ${migration.description}`);
      });

      console.log('\n🔄 Executing migrations...');
      
      let executedCount = 0;
      
      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
        executedCount++;
      }

      console.log(`\n✅ Migration completed successfully!`);
      console.log(`📈 Migrations applied: ${executedCount}`);
      
      return { success: true, migrationsExecuted: executedCount };
      
    } catch (error) {
      console.error('\n❌ Migration failed:', error.message);
      throw error;
    }
  }

  async info() {
    try {
      console.log('📊 Getting migration information...');
      console.log('=====================================');

      const allMigrations = await this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();
      const pendingMigrations = await this.getPendingMigrations();

      console.log(`📁 Total migrations found: ${allMigrations.length}`);
      console.log(`✅ Applied migrations: ${appliedMigrations.length}`);
      console.log(`⏳ Pending migrations: ${pendingMigrations.length}`);

      if (allMigrations.length > 0) {
        console.log('\n📋 Migration Status:');
        
        const appliedVersions = new Set(appliedMigrations.map(m => m.version));
        
        allMigrations.forEach(migration => {
          const isApplied = appliedVersions.has(migration.version);
          const icon = isApplied ? '✅' : '⏳';
          const status = isApplied ? 'APPLIED' : 'PENDING';
          console.log(`   ${icon} V${migration.version} - ${migration.description} (${status})`);
        });

        if (appliedMigrations.length > 0) {
          const latest = appliedMigrations[appliedMigrations.length - 1];
          console.log(`\n🎯 Latest applied migration: V${latest.version} - ${latest.description}`);
          console.log(`📅 Applied on: ${latest.installed_on}`);
        }
      }

      return {
        total: allMigrations.length,
        applied: appliedMigrations.length,
        pending: pendingMigrations.length,
        migrations: allMigrations
      };
      
    } catch (error) {
      console.error('❌ Error getting migration info:', error.message);
      throw error;
    }
  }

  async clean() {
    try {
      console.log('🧹 Cleaning database...');
      console.log('⚠️  WARNING: This will remove ALL database objects!');
      console.log('=====================================');

      // Get all tables in public schema
      const tablesResult = await database.query(`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename != 'pg_stat_statements'
      `);

      if (tablesResult.rows.length === 0) {
        console.log('✅ Database is already clean (no tables found)');
        return { success: true };
      }

      console.log(`🗑️  Found ${tablesResult.rows.length} table(s) to remove:`);
      tablesResult.rows.forEach(row => {
        console.log(`   📄 ${row.tablename}`);
      });

      // Drop all tables
      for (const row of tablesResult.rows) {
        console.log(`   🗑️  Dropping table: ${row.tablename}`);
        await database.query(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`);
      }

      console.log('\n✅ Database cleaned successfully!');
      return { success: true };
      
    } catch (error) {
      console.error('❌ Clean error:', error.message);
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const command = process.argv[2] || 'migrate';
  const migrator = new DatabaseMigrator();

  try {
    switch (command) {
      case 'migrate':
        await migrator.migrate();
        break;
      case 'info':
        await migrator.info();
        break;
      case 'clean':
        await migrator.clean();
        break;
      default:
        console.log('Usage: node migrate.js [command]');
        console.log('Commands:');
        console.log('  migrate - Run pending migrations (default)');
        console.log('  info    - Show migration status');
        console.log('  clean   - Clean database (removes all objects)');
        process.exit(1);
    }
  } catch (error) {
    console.error('Migration script failed:', error.message);
    process.exit(1);
  } finally {
    await database.close();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = DatabaseMigrator;
