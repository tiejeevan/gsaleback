// Script to create products-related tables
const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function createProductsTables() {
  try {
    console.log('🚀 Creating products tables...\n');

    // Read the SQL file
    const sqlFile = path.join(__dirname, 'create-products-tables.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Execute the SQL
    await pool.query(sql);

    console.log('✅ Products tables created successfully!\n');

    // Verify tables were created
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('categories', 'products', 'product_attributes', 'product_media')
      ORDER BY table_name;
    `);

    console.log('📋 Created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });

    // Check row counts
    console.log('\n📊 Initial row counts:');
    const categories = await pool.query('SELECT COUNT(*) FROM categories');
    const products = await pool.query('SELECT COUNT(*) FROM products');
    const attributes = await pool.query('SELECT COUNT(*) FROM product_attributes');
    const media = await pool.query('SELECT COUNT(*) FROM product_media');

    console.log(`  • categories: ${categories.rows[0].count}`);
    console.log(`  • products: ${products.rows[0].count}`);
    console.log(`  • product_attributes: ${attributes.rows[0].count}`);
    console.log(`  • product_media: ${media.rows[0].count}`);

    console.log('\n✨ Products feature database setup complete!');

  } catch (err) {
    console.error('❌ Error creating products tables:', err.message);
    console.error(err);
  } finally {
    await pool.end();
  }
}

createProductsTables();
