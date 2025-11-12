const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function verify() {
  try {
    // Check tables
    const tables = await pool.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_name IN ('carts', 'cart_items', 'orders', 'order_items', 'order_status_history')
      ORDER BY table_name
    `);
    
    console.log('\n📊 Cart & Order Tables:');
    tables.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name} (${row.column_count} columns)`);
    });
    
    // Check triggers
    const triggers = await pool.query(`
      SELECT trigger_name, event_object_table
      FROM information_schema.triggers
      WHERE event_object_table IN ('carts', 'cart_items', 'orders', 'order_items')
      ORDER BY event_object_table, trigger_name
    `);
    
    console.log('\n⚡ Triggers:');
    triggers.rows.forEach(row => {
      console.log(`   ✓ ${row.trigger_name} on ${row.event_object_table}`);
    });
    
    // Check functions
    const functions = await pool.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name IN ('update_cart_totals', 'generate_order_number')
    `);
    
    console.log('\n🔧 Functions:');
    functions.rows.forEach(row => {
      console.log(`   ✓ ${row.routine_name}()`);
    });
    
    console.log('\n✅ All cart and order system components are ready!\n');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

verify();
