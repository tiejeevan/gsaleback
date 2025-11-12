const pool = require('./db');

async function checkCategories() {
  try {
    const result = await pool.query('SELECT id, name, slug FROM categories ORDER BY name');
    
    console.log('\n=== Categories in Database ===\n');
    
    if (result.rows.length === 0) {
      console.log('❌ No categories found!');
      console.log('\nYou can use category_id = NULL for test products');
    } else {
      console.log(`✅ Found ${result.rows.length} categories:\n`);
      result.rows.forEach(cat => {
        console.log(`  ID: ${cat.id}`);
        console.log(`  Name: ${cat.name}`);
        console.log(`  Slug: ${cat.slug}`);
        console.log('  ---');
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkCategories();
