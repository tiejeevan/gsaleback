const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations/add_user_location.sql'),
      'utf8'
    );
    
    await pool.query(sql);
    console.log('✅ Location migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
