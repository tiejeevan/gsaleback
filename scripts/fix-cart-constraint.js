// Script to fix cart unique constraint issue
require('dotenv').config();
const pool = require('../db');

async function fixCartConstraint() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing cart unique constraint...\n');

    // Drop the old unique constraint
    console.log('1. Dropping old unique constraint...');
    await client.query(`
      ALTER TABLE carts DROP CONSTRAINT IF EXISTS carts_user_id_key;
    `);
    console.log('✓ Old constraint dropped\n');

    // Create a partial unique index for active carts only
    console.log('2. Creating partial unique index for active carts...');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS carts_user_id_active_unique 
      ON carts(user_id) 
      WHERE status = 'active';
    `);
    console.log('✓ Partial unique index created\n');

    // Verify the change
    console.log('3. Verifying the new index...');
    const result = await client.query(`
      SELECT 
        indexname, 
        indexdef 
      FROM pg_indexes 
      WHERE tablename = 'carts' 
      AND indexname = 'carts_user_id_active_unique';
    `);

    if (result.rows.length > 0) {
      console.log('✓ Index verified successfully:');
      console.log(`  Name: ${result.rows[0].indexname}`);
      console.log(`  Definition: ${result.rows[0].indexdef}\n`);
    }

    console.log('✅ Cart constraint fix completed successfully!');
    console.log('\nNow users can have multiple carts (converted, abandoned)');
    console.log('but only one active cart at a time.\n');

  } catch (error) {
    console.error('❌ Error fixing cart constraint:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the fix
fixCartConstraint()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
