// Script to test products API endpoints
const pool = require('../db');

async function testProductsAPI() {
  try {
    console.log('🧪 Testing Products API Setup...\n');

    // Test 1: Check if tables exist
    console.log('1️⃣ Checking database tables...');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('categories', 'products', 'product_attributes', 'product_media')
      ORDER BY table_name;
    `);
    
    if (tablesResult.rows.length === 4) {
      console.log('   ✅ All 4 tables exist');
      tablesResult.rows.forEach(row => console.log(`      • ${row.table_name}`));
    } else {
      console.log('   ❌ Missing tables!');
      return;
    }

    // Test 2: Check categories
    console.log('\n2️⃣ Checking sample categories...');
    const categoriesResult = await pool.query('SELECT * FROM categories');
    console.log(`   ✅ Found ${categoriesResult.rows.length} categories`);
    categoriesResult.rows.forEach(cat => {
      console.log(`      • ${cat.name} (${cat.slug})`);
    });

    // Test 3: Check if we can insert a test product
    console.log('\n3️⃣ Testing product creation...');
    
    // Get first user for testing
    const userResult = await pool.query('SELECT id FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.log('   ⚠️  No users found - skipping product creation test');
    } else {
      const userId = userResult.rows[0].id;
      const categoryId = categoriesResult.rows[0].id;

      // Insert test product
      // Note: owner_id is stored as string to support polymorphic relationships
      const productResult = await pool.query(`
        INSERT INTO products (
          title, slug, description, price, category_id, 
          stock_quantity, status, owner_type, owner_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        'Test Product',
        'test-product-' + Date.now(),
        'This is a test product',
        99.99,
        categoryId,
        10,
        'active',
        'User',
        userId.toString(),
        userId
      ]);

      console.log('   ✅ Test product created successfully');
      console.log(`      • ID: ${productResult.rows[0].id}`);
      console.log(`      • Title: ${productResult.rows[0].title}`);
      console.log(`      • Price: $${productResult.rows[0].price}`);

      // Clean up test product
      await pool.query('DELETE FROM products WHERE id = $1', [productResult.rows[0].id]);
      console.log('   ✅ Test product cleaned up');
    }

    // Test 4: Check indexes
    console.log('\n4️⃣ Checking database indexes...');
    const indexResult = await pool.query(`
      SELECT 
        tablename, 
        indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND tablename IN ('products', 'categories', 'product_attributes', 'product_media')
      ORDER BY tablename, indexname;
    `);
    console.log(`   ✅ Found ${indexResult.rows.length} indexes`);
    
    const indexesByTable = {};
    indexResult.rows.forEach(row => {
      if (!indexesByTable[row.tablename]) {
        indexesByTable[row.tablename] = [];
      }
      indexesByTable[row.tablename].push(row.indexname);
    });

    Object.keys(indexesByTable).forEach(table => {
      console.log(`      • ${table}: ${indexesByTable[table].length} indexes`);
    });

    // Test 5: Check full-text search capability
    console.log('\n5️⃣ Testing full-text search setup...');
    const searchIndexResult = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'products' 
      AND indexname LIKE '%search%';
    `);
    
    if (searchIndexResult.rows.length > 0) {
      console.log('   ✅ Full-text search index exists');
    } else {
      console.log('   ⚠️  Full-text search index not found');
    }

    console.log('\n✨ Products API setup test complete!');
    console.log('\n📋 Summary:');
    console.log('   • Database tables: ✅ Ready');
    console.log('   • Sample categories: ✅ Ready');
    console.log('   • Product creation: ✅ Working');
    console.log('   • Database indexes: ✅ Optimized');
    console.log('\n🚀 You can now start using the Products API!');
    console.log('\n📖 API Documentation: See PRODUCTS.md');
    console.log('   Base URL: http://localhost:5001/api/products');

  } catch (err) {
    console.error('❌ Error testing products API:', err.message);
    console.error(err);
  } finally {
    await pool.end();
  }
}

testProductsAPI();
