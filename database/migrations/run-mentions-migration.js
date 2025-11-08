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
    console.log('🚀 Starting mentions migration...\n');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'add-mentions-to-comments.sql');
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
      WHERE table_name = 'comments' AND column_name = 'mentions'
    `);
    
    if (mentionsColumn.rows.length > 0) {
      console.log('✓ mentions column added to comments table');
    }
    
    const mentionsTable = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'comment_mentions'
    `);
    
    if (mentionsTable.rows.length > 0) {
      console.log('✓ comment_mentions table created');
    }
    
    const indexes = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename IN ('comments', 'comment_mentions') 
      AND indexname LIKE '%mention%'
    `);
    
    console.log(`✓ ${indexes.rows.length} indexes created for mentions`);
    
    console.log('\n✨ Database is ready for @mentions functionality!');
    
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
