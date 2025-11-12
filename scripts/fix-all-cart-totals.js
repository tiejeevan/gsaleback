// Fix all cart totals in database
require('dotenv').config();
const pool = require('../db');

async function fixAllCartTotals() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing all cart totals...\n');

    // Get all active carts
    const cartsResult = await client.query(
      `SELECT id, user_id, total_items, total_amount FROM carts WHERE status = 'active'`
    );

    console.log(`Found ${cartsResult.rows.length} active carts\n`);

    let fixed = 0;
    let alreadyCorrect = 0;

    for (const cart of cartsResult.rows) {
      // Get actual totals from cart_items
      const itemsResult = await client.query(
        `SELECT 
          COALESCE(SUM(quantity), 0) as actual_items,
          COALESCE(SUM(subtotal), 0) as actual_amount
         FROM cart_items
         WHERE cart_id = $1`,
        [cart.id]
      );

      const actual = itemsResult.rows[0];
      const actualItems = parseInt(actual.actual_items);
      const actualAmount = parseFloat(actual.actual_amount);

      // Check if needs fixing
      if (cart.total_items !== actualItems || parseFloat(cart.total_amount) !== actualAmount) {
        console.log(`Fixing cart for user ${cart.user_id}:`);
        console.log(`  Old: ${cart.total_items} items, $${cart.total_amount}`);
        console.log(`  New: ${actualItems} items, $${actualAmount.toFixed(2)}`);

        await client.query(
          `UPDATE carts 
           SET total_items = $1, total_amount = $2, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $3`,
          [actualItems, actualAmount, cart.id]
        );

        fixed++;
      } else {
        alreadyCorrect++;
      }
    }

    console.log();
    console.log(`✅ Fixed: ${fixed} carts`);
    console.log(`✓ Already correct: ${alreadyCorrect} carts`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixAllCartTotals()
  .then(() => {
    console.log('\n✅ All cart totals fixed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
