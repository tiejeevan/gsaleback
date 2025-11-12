// Script to find products that might be "missing" (soft deleted or filtered out)
const pool = require('../db');

async function findMissingProducts() {
  try {
    console.log('🔍 Searching for all products (including deleted)...\n');

    // Get all products including soft-deleted
    const allProducts = await pool.query(`
      SELECT 
        id,
        title,
        status,
        is_featured,
        deleted_at,
        created_at
      FROM products
      ORDER BY created_at DESC
      LIMIT 20
    `);

    console.log(`📊 Found ${allProducts.rows.length} recent products:\n`);

    allProducts.rows.forEach((product, index) => {
      const isDeleted = product.deleted_at ? '🗑️  DELETED' : '✅ Active';
      const isFeatured = product.is_featured ? '⭐ Featured' : '';
      
      console.log(`${index + 1}. ${product.title}`);
      console.log(`   ID: ${product.id}`);
      console.log(`   Status: ${product.status} ${isDeleted} ${isFeatured}`);
      console.log(`   Created: ${product.created_at}`);
      if (product.deleted_at) {
        console.log(`   Deleted: ${product.deleted_at}`);
      }
      console.log('');
    });

    // Count by status
    const statusCount = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE deleted_at IS NULL) as active_count,
        COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted_count
      FROM products
      GROUP BY status
    `);

    console.log('\n📈 Products by Status:');
    statusCount.rows.forEach(row => {
      console.log(`   ${row.status}: ${row.active_count} active, ${row.deleted_count} deleted`);
    });

    // Find recently deleted products
    const recentlyDeleted = await pool.query(`
      SELECT 
        id,
        title,
        status,
        is_featured,
        deleted_at
      FROM products
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
      LIMIT 10
    `);

    if (recentlyDeleted.rows.length > 0) {
      console.log('\n\n🗑️  Recently Deleted Products:');
      recentlyDeleted.rows.forEach((product, index) => {
        console.log(`${index + 1}. ${product.title}`);
        console.log(`   ID: ${product.id}`);
        console.log(`   Was Featured: ${product.is_featured ? 'Yes' : 'No'}`);
        console.log(`   Deleted: ${product.deleted_at}`);
        console.log('');
      });
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

findMissingProducts();
