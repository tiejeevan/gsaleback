// Remove post_id NOT NULL constraint
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Removing NOT NULL constraint from post_id...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'remove_post_id_constraint.sql'),
      'utf8'
    );
    
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the changes
    const result = await client.query(`
      SELECT column_name, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'bookmarks' AND column_name = 'post_id';
    `);
    
    console.log('\npost_id column nullable status:');
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
