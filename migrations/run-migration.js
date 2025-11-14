// Run database migration
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('Connecting to database...');
  const client = await pool.connect();
  
  try {
    console.log('Starting migration: add_polymorphic_bookmarks...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'add_polymorphic_bookmarks.sql'),
      'utf8'
    );
    
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the changes
    const result = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'bookmarks' 
      ORDER BY ordinal_position;
    `);
    
    console.log('\nBookmarks table structure:');
    console.table(result.rows);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
