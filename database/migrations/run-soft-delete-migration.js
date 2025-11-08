const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting soft delete migration...\n');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'add-soft-delete-mentions.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute the migration
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    
    console.log('✅ Migration completed successfully!\n');
    
    // Verify the changes
    console.log('📊 Verifying changes...\n');
    
    const mentionsColumn = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'comment_mentions' AND column_name = 'deleted_at'
    `);
    
    if (mentionsColumn.rows.length > 0) {
      console.log('✓ deleted_at column added to comment_mentions table');
    }
    
    const notificationsColumn = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'notifications' AND column_name = 'deleted_at'
    `);
    
    if (notificationsColumn.rows.length > 0) {
      console.log('✓ deleted_at column added to notifications table');
    }
    
    const indexes = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename IN ('comment_mentions', 'notifications') 
      AND indexname LIKE '%not_deleted%'
    `);
    
    console.log(`✓ ${indexes.rows.length} indexes created for soft delete`);
    
    console.log('\n✨ Tables now support soft delete!');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
