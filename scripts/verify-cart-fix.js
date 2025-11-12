// Script to verify cart constraint fix
require('dotenv').config();
const pool = require('../db');

async function verifyCartFix() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Verifying cart constraint fix...\n');

    // Check for users with multiple active carts (should be none)
    console.log('1. Checking for users with multiple active carts...');
    const duplicateActive = await client.query(`
      SELECT user_id, COUNT(*) as cart_count
      FROM carts
      WHERE status = 'active'
      GROUP BY user_id
      HAVING COUNT(*) > 1;
    `);

    if (duplicateActive.rows.length > 0) {
      console.log('⚠️  Found users with multiple active carts:');
      console.log(duplicateActive.rows);
    } else {
      console.log('✓ No users with multiple active carts\n');
    }

    // Show cart distribution by status
    console.log('2. Cart distribution by status:');
    const statusDist = await client.query(`
      SELECT status, COUNT(*) as count
      FROM carts
      GROUP BY status
      ORDER BY count DESC;
    `);
    
    statusDist.rows.forEach(row => {
      console.log(`   ${row.status}: ${row.count}`);
    });
    console.log();

    // Show users with multiple carts (different statuses)
    console.log('3. Users with multiple carts (any status):');
    const multiCart = await client.query(`
      SELECT user_id, COUNT(*) as cart_count,
             STRING_AGG(status, ', ') as statuses
      FROM carts
      GROUP BY user_id
      HAVING COUNT(*) > 1
      LIMIT 5;
    `);

    if (multiCart.rows.length > 0) {
      console.log('   Users can now have multiple carts with different statuses:');
      multiCart.rows.forEach(row => {
        console.log(`   User ${row.user_id}: ${row.cart_count} carts (${row.statuses})`);
      });
    } else {
      console.log('   No users with multiple carts yet');
    }
    console.log();

    console.log('✅ Verification complete!\n');

  } catch (error) {
    console.error('❌ Error verifying cart fix:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run verification
verifyCartFix()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
