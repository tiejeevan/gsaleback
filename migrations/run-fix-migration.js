// Run fix migration
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Starting migration: fix_item_id_type...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'fix_item_id_type.sql'),
      'utf8'
    );
    
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the changes
    const result = await client.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'bookmarks' AND column_name = 'item_id';
    `);
    
    console.log('\nitem_id column type:');
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
