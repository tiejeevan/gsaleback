const productsService = require('../services/productsService');

async function testGetProducts() {
  try {
    console.log('Testing getProducts...\n');
    
    const result = await productsService.getProducts({
      page: 1,
      limit: 10
    });
    
    console.log('✅ Products returned:', result.products.length);
    console.log('📊 Total in DB:', result.pagination.total);
    console.log('📄 Pages:', result.pagination.pages);
    console.log('\nProducts:');
    result.products.forEach((p, i) => {
      console.log(`${i + 1}. ${p.title} (Featured: ${p.is_featured})`);
    });
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
  } finally {
    process.exit();
  }
}

testGetProducts();
