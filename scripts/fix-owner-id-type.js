// Fix owner_id column type to support polymorphic relationships
const pool = require('../db');

async function fixOwnerIdType() {
  try {
    console.log('🔧 Fixing owner_id column type...\n');

    await pool.query('ALTER TABLE products ALTER COLUMN owner_id TYPE VARCHAR(255);');

    console.log('✅ owner_id column type changed to VARCHAR(255)');
    console.log('   This allows storing both integer user IDs and UUID store IDs\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

fixOwnerIdType();
