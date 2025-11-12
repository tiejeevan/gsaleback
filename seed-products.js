const pool = require('./db');

// Category IDs from your database
const CATEGORIES = {
  electronics: '2d069959-3cfa-4fa6-803f-849da95bcabb',
  clothing: '85a884dc-65fd-4ae2-804f-83be9bbb4007',
  homeGarden: '5a1b3768-95b9-4dee-8dc5-0e632115bdc7',
  sports: '68b5196f-d68e-48c5-b886-95099bd56466'
};

const products = [
  // Electronics (10 products)
  {
    title: 'Apple iPhone 13 Pro - 128GB',
    slug: 'apple-iphone-13-pro-128gb',
    description: 'Excellent condition iPhone 13 Pro with 128GB storage. Includes original box and charger. Battery health at 95%. No scratches on screen.',
    price: 699.99,
    compare_at_price: 999.99,
    cost_price: 650.00,
    stock_quantity: 3,
    category_id: CATEGORIES.electronics,
    images: ['https://images.unsplash.com/photo-1632661674596-df8be070a5c5?w=800', 'https://images.unsplash.com/photo-1632633173522-de1f2b67e4bb?w=800'],
    tags: ['smartphone', 'apple', 'iphone', 'electronics'],
    is_featured: true
  },
  {
    title: 'Sony WH-1000XM4 Wireless Headphones',
    slug: 'sony-wh-1000xm4-headphones',
    description: 'Premium noise-cancelling headphones. Like new condition, barely used. Comes with carrying case and all accessories.',
    price: 249.99,
    compare_at_price: 349.99,
    cost_price: 200.00,
    stock_quantity: 5,
    category_id: CATEGORIES.electronics,
    images: ['https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800'],
    tags: ['headphones', 'sony', 'audio', 'wireless']
  },
  {
    title: 'Samsung 55" 4K Smart TV',
    slug: 'samsung-55-4k-smart-tv',
    description: '55-inch 4K UHD Smart TV with HDR. Perfect working condition. Wall mount included. Great for gaming and streaming.',
    price: 449.99,
    compare_at_price: 699.99,
    cost_price: 400.00,
    stock_quantity: 2,
    category_id: CATEGORIES.electronics,
    images: ['https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800'],
    tags: ['tv', 'samsung', '4k', 'smart-tv']
  },
  {
    title: 'Apple MacBook Air M1 - 256GB',
    slug: 'macbook-air-m1-256gb',
    description: 'MacBook Air with M1 chip, 8GB RAM, 256GB SSD. Excellent condition with minimal wear. Includes original charger.',
    price: 799.99,
    compare_at_price: 999.99,
    cost_price: 750.00,
    stock_quantity: 2,
    category_id: CATEGORIES.electronics,
    images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800'],
    tags: ['laptop', 'apple', 'macbook', 'computer'],
    is_featured: true
  },
  {
    title: 'Canon EOS Rebel T7 DSLR Camera',
    slug: 'canon-eos-rebel-t7',
    description: 'DSLR camera with 18-55mm lens. Perfect for beginners. Includes camera bag, extra battery, and 64GB SD card.',
    price: 399.99,
    compare_at_price: 549.99,
    cost_price: 350.00,
    stock_quantity: 4,
    category_id: CATEGORIES.electronics,
    images: ['https://images.unsplash.com/photo-1606980707986-683d8dc3e0e5?w=800'],
    tags: ['camera', 'canon', 'dslr', 'photography']
  },
  {
    title: 'Nintendo Switch OLED - Neon',
    slug: 'nintendo-switch-oled-neon',
    description: 'Nintendo Switch OLED model with vibrant 7-inch screen. Includes dock, Joy-Cons, and 3 games.',
    price: 299.99,
    compare_at_price: 349.99,
    cost_price: 280.00,
    stock_quantity: 6,
    category_id: CATEGORIES.electronics,
    images: ['https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=800'],
    tags: ['gaming', 'nintendo', 'switch', 'console']
  },
  {
    title: 'iPad Pro 11" 2021 - 128GB',
    slug: 'ipad-pro-11-2021-128gb',
    description: 'iPad Pro with M1 chip. Includes Apple Pencil 2nd gen and Magic Keyboard. Perfect for work and creativity.',
    price: 649.99,
    compare_at_price: 899.99,
    cost_price: 600.00,
    stock_quantity: 3,
    category_id: CATEGORIES.electronics,
    images: ['https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=800'],
    tags: ['tablet', 'ipad', 'apple', 'pro']
  },
  {
    title: 'Bose SoundLink Bluetooth Speaker',
    slug: 'bose-soundlink-speaker',
    description: 'Portable Bluetooth speaker with amazing sound quality. 12-hour battery life. Water-resistant design.',
    price: 129.99,
    compare_at_price: 179.99,
    cost_price: 100.00,
    stock_quantity: 8,
    category_id: CATEGORIES.electronics,
    images: ['https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800'],
    tags: ['speaker', 'bose', 'bluetooth', 'audio']
  },
  {
    title: 'Apple Watch Series 7 - 45mm',
    slug: 'apple-watch-series-7-45mm',
    description: 'Apple Watch Series 7 with GPS. Includes 3 extra bands. Excellent condition with no scratches.',
    price: 329.99,
    compare_at_price: 429.99,
    cost_price: 300.00,
    stock_quantity: 4,
    category_id: CATEGORIES.electronics,
    images: ['https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=800'],
    tags: ['smartwatch', 'apple', 'watch', 'fitness']
  },
  {
    title: 'Logitech MX Master 3 Mouse',
    slug: 'logitech-mx-master-3',
    description: 'Premium wireless mouse for productivity. Ergonomic design with customizable buttons. Works on any surface.',
    price: 79.99,
    compare_at_price: 99.99,
    cost_price: 60.00,
    stock_quantity: 10,
    category_id: CATEGORIES.electronics,
    images: ['https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800'],
    tags: ['mouse', 'logitech', 'wireless', 'computer']
  },

  // Clothing (10 products)
  {
    title: "Levi's 501 Original Jeans - Blue",
    slug: 'levis-501-jeans-blue',
    description: 'Classic Levi\'s 501 jeans in medium blue wash. Size 32x32. Gently worn, excellent condition.',
    price: 49.99,
    compare_at_price: 79.99,
    cost_price: 35.00,
    stock_quantity: 15,
    category_id: CATEGORIES.clothing,
    images: ['https://images.unsplash.com/photo-1542272604-787c3835535d?w=800'],
    tags: ['jeans', 'levis', 'denim', 'mens'],
    is_featured: true
  },
  {
    title: 'Nike Air Max 270 Sneakers',
    slug: 'nike-air-max-270',
    description: 'Nike Air Max 270 in white/black colorway. Size 10. Worn twice, like new condition with original box.',
    price: 89.99,
    compare_at_price: 150.00,
    cost_price: 70.00,
    stock_quantity: 8,
    category_id: CATEGORIES.clothing,
    images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800'],
    tags: ['sneakers', 'nike', 'shoes', 'athletic']
  },
  {
    title: 'North Face Fleece Jacket - Black',
    slug: 'north-face-fleece-jacket',
    description: 'The North Face fleece jacket. Size Large. Perfect for layering. Barely worn, no signs of wear.',
    price: 59.99,
    compare_at_price: 99.99,
    cost_price: 45.00,
    stock_quantity: 12,
    category_id: CATEGORIES.clothing,
    images: ['https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800'],
    tags: ['jacket', 'north-face', 'fleece', 'outerwear']
  },
  {
    title: 'Adidas Originals Hoodie - Grey',
    slug: 'adidas-hoodie-grey',
    description: 'Comfortable Adidas hoodie in heather grey. Size Medium. Classic trefoil logo. Great condition.',
    price: 39.99,
    compare_at_price: 65.00,
    cost_price: 30.00,
    stock_quantity: 20,
    category_id: CATEGORIES.clothing,
    images: ['https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800'],
    tags: ['hoodie', 'adidas', 'sweatshirt', 'casual']
  },
  {
    title: 'Ray-Ban Aviator Sunglasses',
    slug: 'rayban-aviator-sunglasses',
    description: 'Classic Ray-Ban aviator sunglasses with gold frame. Includes original case and cleaning cloth.',
    price: 89.99,
    compare_at_price: 154.00,
    cost_price: 70.00,
    stock_quantity: 6,
    category_id: CATEGORIES.clothing,
    images: ['https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800'],
    tags: ['sunglasses', 'rayban', 'accessories', 'eyewear']
  },
  {
    title: 'Patagonia Down Jacket - Navy',
    slug: 'patagonia-down-jacket',
    description: 'Patagonia down jacket, perfect for winter. Size Large. Warm and lightweight. Excellent condition.',
    price: 149.99,
    compare_at_price: 249.99,
    cost_price: 120.00,
    stock_quantity: 5,
    category_id: CATEGORIES.clothing,
    images: ['https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=800'],
    tags: ['jacket', 'patagonia', 'winter', 'down']
  },
  {
    title: 'Timberland Boots - Wheat',
    slug: 'timberland-boots-wheat',
    description: 'Classic Timberland 6-inch boots in wheat color. Size 11. Waterproof and durable. Gently used.',
    price: 119.99,
    compare_at_price: 189.99,
    cost_price: 95.00,
    stock_quantity: 7,
    category_id: CATEGORIES.clothing,
    images: ['https://images.unsplash.com/photo-1520639888713-7851133b1ed0?w=800'],
    tags: ['boots', 'timberland', 'shoes', 'winter']
  },
  {
    title: 'Champion Sweatpants - Black',
    slug: 'champion-sweatpants',
    description: 'Comfortable Champion sweatpants. Size Large. Perfect for lounging or workouts. Like new.',
    price: 29.99,
    compare_at_price: 45.00,
    cost_price: 20.00,
    stock_quantity: 25,
    category_id: CATEGORIES.clothing,
    images: ['https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=800'],
    tags: ['sweatpants', 'champion', 'athletic', 'casual']
  },
  {
    title: 'Carhartt Beanie - Brown',
    slug: 'carhartt-beanie',
    description: 'Carhartt knit beanie in brown. One size fits all. Warm and comfortable. Never worn.',
    price: 19.99,
    compare_at_price: 29.99,
    cost_price: 12.00,
    stock_quantity: 30,
    category_id: CATEGORIES.clothing,
    images: ['https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=800'],
    tags: ['beanie', 'carhartt', 'hat', 'winter']
  },
  {
    title: 'Vans Old Skool Sneakers - Black/White',
    slug: 'vans-old-skool',
    description: 'Classic Vans Old Skool in black and white. Size 9. Iconic skate shoe. Good condition.',
    price: 44.99,
    compare_at_price: 65.00,
    cost_price: 35.00,
    stock_quantity: 12,
    category_id: CATEGORIES.clothing,
    images: ['https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800'],
    tags: ['sneakers', 'vans', 'shoes', 'skate']
  },

  // Home & Garden (5 products)
  {
    title: 'Dyson V11 Cordless Vacuum',
    slug: 'dyson-v11-vacuum',
    description: 'Dyson V11 cordless vacuum with multiple attachments. Powerful suction, long battery life. Like new condition.',
    price: 399.99,
    compare_at_price: 599.99,
    cost_price: 350.00,
    stock_quantity: 4,
    category_id: CATEGORIES.homeGarden,
    images: ['https://images.unsplash.com/photo-1558317374-067fb5f30001?w=800'],
    tags: ['vacuum', 'dyson', 'cleaning', 'home'],
    is_featured: true
  },
  {
    title: 'KitchenAid Stand Mixer - Red',
    slug: 'kitchenaid-stand-mixer',
    description: 'KitchenAid Artisan stand mixer in empire red. 5-quart capacity. Includes multiple attachments. Excellent condition.',
    price: 249.99,
    compare_at_price: 379.99,
    cost_price: 200.00,
    stock_quantity: 3,
    category_id: CATEGORIES.homeGarden,
    images: ['https://images.unsplash.com/photo-1578269174936-2709b6aeb913?w=800'],
    tags: ['mixer', 'kitchenaid', 'kitchen', 'appliance']
  },
  {
    title: 'Instant Pot Duo 8-Quart',
    slug: 'instant-pot-duo-8qt',
    description: '8-quart Instant Pot pressure cooker. 7-in-1 functionality. Perfect for large families. Used only a few times.',
    price: 89.99,
    compare_at_price: 139.99,
    cost_price: 70.00,
    stock_quantity: 8,
    category_id: CATEGORIES.homeGarden,
    images: ['https://images.unsplash.com/photo-1585515320310-259814833e62?w=800'],
    tags: ['instant-pot', 'pressure-cooker', 'kitchen', 'cooking']
  },
  {
    title: 'Ninja Professional Blender',
    slug: 'ninja-professional-blender',
    description: 'Ninja professional blender with 1000W motor. Perfect for smoothies and crushing ice. Includes multiple cups.',
    price: 79.99,
    compare_at_price: 119.99,
    cost_price: 60.00,
    stock_quantity: 10,
    category_id: CATEGORIES.homeGarden,
    images: ['https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=800'],
    tags: ['blender', 'ninja', 'kitchen', 'smoothie']
  },
  {
    title: 'Keurig K-Elite Coffee Maker',
    slug: 'keurig-k-elite',
    description: 'Keurig K-Elite single-serve coffee maker. Iced coffee setting. Includes water filter and 12 K-cups.',
    price: 129.99,
    compare_at_price: 189.99,
    cost_price: 100.00,
    stock_quantity: 6,
    category_id: CATEGORIES.homeGarden,
    images: ['https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=800'],
    tags: ['coffee-maker', 'keurig', 'kitchen', 'appliance']
  },

  // Sports & Outdoors (5 products)
  {
    title: 'Yeti Rambler 30oz Tumbler',
    slug: 'yeti-rambler-30oz',
    description: 'Yeti Rambler stainless steel tumbler. Keeps drinks cold for 24 hours. Dishwasher safe. Brand new.',
    price: 34.99,
    compare_at_price: 45.00,
    cost_price: 25.00,
    stock_quantity: 20,
    category_id: CATEGORIES.sports,
    images: ['https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800'],
    tags: ['tumbler', 'yeti', 'drinkware', 'outdoor']
  },
  {
    title: 'Coleman 6-Person Camping Tent',
    slug: 'coleman-6-person-tent',
    description: 'Coleman Sundome 6-person tent. Easy setup, weather-resistant. Used twice, excellent condition. Includes carry bag.',
    price: 89.99,
    compare_at_price: 139.99,
    cost_price: 70.00,
    stock_quantity: 5,
    category_id: CATEGORIES.sports,
    images: ['https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800'],
    tags: ['tent', 'coleman', 'camping', 'outdoor']
  },
  {
    title: 'Schwinn Mountain Bike - 27.5"',
    slug: 'schwinn-mountain-bike',
    description: 'Schwinn mountain bike with 27.5" wheels. 21-speed Shimano drivetrain. Great for trails. Well maintained.',
    price: 299.99,
    compare_at_price: 449.99,
    cost_price: 250.00,
    stock_quantity: 3,
    category_id: CATEGORIES.sports,
    images: ['https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?w=800'],
    tags: ['bike', 'schwinn', 'mountain-bike', 'cycling']
  },
  {
    title: 'Wilson Evolution Basketball',
    slug: 'wilson-evolution-basketball',
    description: 'Wilson Evolution indoor basketball. Official size and weight. Excellent grip. Barely used.',
    price: 49.99,
    compare_at_price: 69.99,
    cost_price: 35.00,
    stock_quantity: 15,
    category_id: CATEGORIES.sports,
    images: ['https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800'],
    tags: ['basketball', 'wilson', 'sports', 'indoor']
  },
  {
    title: 'Bowflex Adjustable Dumbbells',
    slug: 'bowflex-adjustable-dumbbells',
    description: 'Bowflex SelectTech adjustable dumbbells. 5-52.5 lbs per dumbbell. Space-saving design. Like new.',
    price: 299.99,
    compare_at_price: 429.99,
    cost_price: 250.00,
    stock_quantity: 4,
    category_id: CATEGORIES.sports,
    images: ['https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800'],
    tags: ['dumbbells', 'bowflex', 'fitness', 'weights']
  }
];

async function seedProducts() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('\n🌱 Starting to seed products...\n');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const product of products) {
      try {
        const result = await client.query(
          `INSERT INTO products (
            title, slug, description, price, compare_at_price, cost_price,
            stock_quantity, category_id, images, tags, is_featured,
            owner_type, owner_id, created_by, approved_by, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING id, title`,
          [
            product.title,
            product.slug,
            product.description,
            product.price,
            product.compare_at_price,
            product.cost_price,
            product.stock_quantity,
            product.category_id,
            JSON.stringify(product.images),
            JSON.stringify(product.tags),
            product.is_featured || false,
            'User',
            '13',
            13,
            13,
            'active'
          ]
        );
        
        console.log(`✅ Created: ${result.rows[0].title}`);
        successCount++;
      } catch (err) {
        console.error(`❌ Failed to create: ${product.title}`);
        console.error(`   Error: ${err.message}`);
        errorCount++;
      }
    }
    
    await client.query('COMMIT');
    
    console.log('\n' + '='.repeat(50));
    console.log(`✅ Successfully created: ${successCount} products`);
    if (errorCount > 0) {
      console.log(`❌ Failed: ${errorCount} products`);
    }
    console.log('='.repeat(50) + '\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding products:', error.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

seedProducts();
