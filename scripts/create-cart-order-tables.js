// scripts/create-cart-order-tables.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function createTables() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Creating cart and order tables...\n');
    
    // Read and execute SQL file
    const sqlPath = path.join(__dirname, 'create-cart-order-tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await client.query(sql);
    
    console.log('✅ Cart and order tables created successfully!\n');
    
    // Verify tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('carts', 'cart_items', 'orders', 'order_items', 'order_status_history')
      ORDER BY table_name
    `);
    
    console.log('📋 Created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });
    
    console.log('\n✨ Cart and order system is ready!');
    console.log('\n📝 Next steps:');
    console.log('   1. Implement cart service (cartService.js)');
    console.log('   2. Implement order service (orderService.js)');
    console.log('   3. Create cart API endpoints');
    console.log('   4. Create order API endpoints');
    console.log('   5. Build frontend cart UI');
    console.log('   6. Build frontend checkout flow');
    
  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createTables();
