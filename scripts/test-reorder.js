// Script to test reorder functionality
require('dotenv').config();
const pool = require('../db');
const orderService = require('../services/orderService');

async function testReorder() {
  const client = await pool.connect();
  
  try {
    console.log('🧪 Testing Reorder Functionality\n');

    // Get a test order
    const orderResult = await client.query(`
      SELECT id, order_number, user_id 
      FROM orders 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (orderResult.rows.length === 0) {
      console.log('❌ No orders found to test reorder');
      return;
    }

    const testOrder = orderResult.rows[0];
    console.log(`📦 Testing with order: ${testOrder.order_number}`);
    console.log(`   User ID: ${testOrder.user_id}\n`);

    // Get cart count before
    const beforeCart = await client.query(`
      SELECT COUNT(*) as count 
      FROM cart_items ci
      JOIN carts c ON ci.cart_id = c.id
      WHERE c.user_id = $1 AND c.status = 'active'
    `, [testOrder.user_id]);
    
    console.log(`📊 Cart items before reorder: ${beforeCart.rows[0].count}`);

    // Test reorder
    console.log('🔄 Executing reorder...');
    await orderService.reorderFromOrder(testOrder.id, testOrder.user_id);
    console.log('✓ Reorder completed\n');

    // Get cart count after
    const afterCart = await client.query(`
      SELECT COUNT(*) as count 
      FROM cart_items ci
      JOIN carts c ON ci.cart_id = c.id
      WHERE c.user_id = $1 AND c.status = 'active'
    `, [testOrder.user_id]);
    
    console.log(`📊 Cart items after reorder: ${afterCart.rows[0].count}`);
    
    const itemsAdded = parseInt(afterCart.rows[0].count) - parseInt(beforeCart.rows[0].count);
    console.log(`✅ Successfully added ${itemsAdded} items to cart\n`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run test
testReorder()
  .then(() => {
    console.log('✅ All tests passed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
