// Check cart issue
require('dotenv').config();
const pool = require('../db');

async function checkCart() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking cart issue...\n');

    // Get active cart
    const cartResult = await client.query(
      `SELECT * FROM carts WHERE user_id = 45 AND status = 'active'`
    );

    if (cartResult.rows.length === 0) {
      console.log('No active cart found');
      return;
    }

    const cart = cartResult.rows[0];
    console.log('Cart Info:');
    console.log(`  ID: ${cart.id}`);
    console.log(`  Total Items: ${cart.total_items}`);
    console.log(`  Total Amount: $${cart.total_amount}`);
    console.log();

    // Get cart items
    const itemsResult = await client.query(
      `SELECT * FROM cart_items WHERE cart_id = $1`,
      [cart.id]
    );

    console.log(`Actual Cart Items: ${itemsResult.rows.length}`);
    if (itemsResult.rows.length > 0) {
      itemsResult.rows.forEach(item => {
        console.log(`  - ${item.product_id}: qty ${item.quantity}, $${item.subtotal}`);
      });
    } else {
      console.log('  (No items found)');
    }
    console.log();

    // Check if triggers exist
    console.log('Checking triggers...');
    const triggersResult = await client.query(`
      SELECT trigger_name, event_manipulation, event_object_table
      FROM information_schema.triggers
      WHERE event_object_table = 'cart_items'
    `);

    if (triggersResult.rows.length > 0) {
      console.log('✓ Triggers found:');
      triggersResult.rows.forEach(t => {
        console.log(`  - ${t.trigger_name} on ${t.event_manipulation}`);
      });
    } else {
      console.log('❌ No triggers found on cart_items table!');
    }
    console.log();

    // Fix the cart totals
    console.log('Fixing cart totals...');
    await client.query(`
      UPDATE carts
      SET 
        total_amount = COALESCE((
          SELECT SUM(subtotal)
          FROM cart_items
          WHERE cart_id = $1
        ), 0),
        total_items = COALESCE((
          SELECT SUM(quantity)
          FROM cart_items
          WHERE cart_id = $1
        ), 0),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [cart.id]);

    // Get updated cart
    const updatedCart = await client.query(
      `SELECT * FROM carts WHERE id = $1`,
      [cart.id]
    );

    console.log('✓ Cart totals updated:');
    console.log(`  Total Items: ${updatedCart.rows[0].total_items}`);
    console.log(`  Total Amount: $${updatedCart.rows[0].total_amount}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

checkCart()
  .then(() => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
