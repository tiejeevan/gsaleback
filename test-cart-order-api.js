// test-cart-order-api.js
// Test script for cart and order API endpoints

const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.API_URL || 'http://localhost:5000';
let authToken = '';
let testProductId = '';
let testCartItemId = '';
let testOrderId = '';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testCartAndOrderAPI() {
  try {
    log('\n🧪 CART & ORDER API TEST SUITE\n', 'blue');
    log('='.repeat(50), 'blue');

    // Step 1: Login to get auth token
    log('\n1️⃣  Testing Authentication...', 'yellow');
    try {
      const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
        username: 'testuser',
        password: 'password123'
      });
      authToken = loginResponse.data.token;
      log('✅ Login successful', 'green');
    } catch (error) {
      log('❌ Login failed - Please create a test user first', 'red');
      log('   Run: node create-test-user.js', 'yellow');
      return;
    }

    const headers = { Authorization: `Bearer ${authToken}` };

    // Step 2: Get a test product
    log('\n2️⃣  Getting test product...', 'yellow');
    try {
      const productsResponse = await axios.get(`${API_URL}/api/products?limit=1&status=active`);
      if (productsResponse.data.products.length > 0) {
        testProductId = productsResponse.data.products[0].id;
        log(`✅ Found test product: ${productsResponse.data.products[0].title}`, 'green');
      } else {
        log('❌ No active products found - Please create a product first', 'red');
        return;
      }
    } catch (error) {
      log(`❌ Failed to get products: ${error.message}`, 'red');
      return;
    }

    // Step 3: Test Cart Operations
    log('\n3️⃣  Testing Cart Operations...', 'yellow');

    // 3a. Get empty cart
    log('\n   📦 Getting cart...', 'blue');
    try {
      const cartResponse = await axios.get(`${API_URL}/api/cart`, { headers });
      log(`   ✅ Cart retrieved: ${cartResponse.data.cart.total_items} items`, 'green');
    } catch (error) {
      log(`   ❌ Failed to get cart: ${error.response?.data?.message || error.message}`, 'red');
    }

    // 3b. Add item to cart
    log('\n   ➕ Adding item to cart...', 'blue');
    try {
      const addResponse = await axios.post(
        `${API_URL}/api/cart/add`,
        {
          product_id: testProductId,
          quantity: 2,
          selected_attributes: { color: 'Blue', size: 'M' }
        },
        { headers }
      );
      testCartItemId = addResponse.data.cart_item.id;
      log(`   ✅ Item added to cart: ${addResponse.data.cart.total_items} items, $${addResponse.data.cart.total_amount}`, 'green');
    } catch (error) {
      log(`   ❌ Failed to add to cart: ${error.response?.data?.message || error.message}`, 'red');
    }

    // 3c. Get cart count
    log('\n   🔢 Getting cart count...', 'blue');
    try {
      const countResponse = await axios.get(`${API_URL}/api/cart/count`, { headers });
      log(`   ✅ Cart count: ${countResponse.data.count} items`, 'green');
    } catch (error) {
      log(`   ❌ Failed to get cart count: ${error.response?.data?.message || error.message}`, 'red');
    }

    // 3d. Update cart item quantity
    log('\n   ✏️  Updating cart item quantity...', 'blue');
    try {
      const updateResponse = await axios.put(
        `${API_URL}/api/cart/item/${testCartItemId}`,
        { quantity: 3 },
        { headers }
      );
      log(`   ✅ Cart item updated: ${updateResponse.data.cart.total_items} items, $${updateResponse.data.cart.total_amount}`, 'green');
    } catch (error) {
      log(`   ❌ Failed to update cart item: ${error.response?.data?.message || error.message}`, 'red');
    }

    // 3e. Validate cart
    log('\n   ✔️  Validating cart...', 'blue');
    try {
      const validateResponse = await axios.post(`${API_URL}/api/cart/validate`, {}, { headers });
      if (validateResponse.data.valid) {
        log(`   ✅ Cart is valid`, 'green');
      } else {
        log(`   ⚠️  Cart has issues: ${validateResponse.data.issues.join(', ')}`, 'yellow');
      }
    } catch (error) {
      log(`   ❌ Failed to validate cart: ${error.response?.data?.message || error.message}`, 'red');
    }

    // Step 4: Test Checkout
    log('\n4️⃣  Testing Checkout...', 'yellow');
    try {
      const checkoutResponse = await axios.post(
        `${API_URL}/api/orders/checkout`,
        {
          shipping_address: {
            name: 'John Doe',
            address: '123 Main St',
            city: 'New York',
            state: 'NY',
            zip: '10001',
            country: 'USA',
            phone: '555-1234'
          },
          billing_address: null,
          shipping_method: 'standard',
          payment_method: 'credit_card',
          customer_notes: 'Please deliver after 5 PM',
          tax_rate: 0.08,
          shipping_amount: 10.00,
          discount_amount: 0
        },
        { headers }
      );
      testOrderId = checkoutResponse.data.order.id;
      log(`✅ Order created: ${checkoutResponse.data.order.order_number}`, 'green');
      log(`   Total: $${checkoutResponse.data.order.total_amount}`, 'green');
      log(`   Status: ${checkoutResponse.data.order.status}`, 'green');
    } catch (error) {
      log(`❌ Checkout failed: ${error.response?.data?.message || error.message}`, 'red');
      return;
    }

    // Step 5: Test Order Operations
    log('\n5️⃣  Testing Order Operations...', 'yellow');

    // 5a. Get user orders
    log('\n   📋 Getting user orders...', 'blue');
    try {
      const ordersResponse = await axios.get(`${API_URL}/api/orders`, { headers });
      log(`   ✅ Found ${ordersResponse.data.orders.length} orders`, 'green');
    } catch (error) {
      log(`   ❌ Failed to get orders: ${error.response?.data?.message || error.message}`, 'red');
    }

    // 5b. Get single order
    log('\n   📄 Getting order details...', 'blue');
    try {
      const orderResponse = await axios.get(`${API_URL}/api/orders/${testOrderId}`, { headers });
      log(`   ✅ Order details retrieved: ${orderResponse.data.order.order_number}`, 'green');
      log(`   Items: ${orderResponse.data.order.items.length}`, 'green');
    } catch (error) {
      log(`   ❌ Failed to get order: ${error.response?.data?.message || error.message}`, 'red');
    }

    // 5c. Track order
    log('\n   🚚 Tracking order...', 'blue');
    try {
      const trackResponse = await axios.get(`${API_URL}/api/orders/${testOrderId}/track`, { headers });
      log(`   ✅ Order status: ${trackResponse.data.tracking.status}`, 'green');
    } catch (error) {
      log(`   ❌ Failed to track order: ${error.response?.data?.message || error.message}`, 'red');
    }

    // Step 6: Test Cart After Checkout
    log('\n6️⃣  Verifying cart after checkout...', 'yellow');
    try {
      const cartResponse = await axios.get(`${API_URL}/api/cart`, { headers });
      log(`✅ Cart status: ${cartResponse.data.cart.status}`, 'green');
      log(`   Items: ${cartResponse.data.cart.items.length}`, 'green');
    } catch (error) {
      log(`❌ Failed to get cart: ${error.response?.data?.message || error.message}`, 'red');
    }

    // Step 7: Test Admin Operations (if user is admin)
    log('\n7️⃣  Testing Admin Operations...', 'yellow');

    // 7a. Get order stats
    log('\n   📊 Getting order statistics...', 'blue');
    try {
      const statsResponse = await axios.get(`${API_URL}/api/orders/admin/stats`, { headers });
      log(`   ✅ Order stats retrieved:`, 'green');
      log(`      Total orders: ${statsResponse.data.stats.total_orders}`, 'green');
      log(`      Total revenue: $${statsResponse.data.stats.total_revenue}`, 'green');
      log(`      Average order value: $${statsResponse.data.stats.average_order_value}`, 'green');
    } catch (error) {
      if (error.response?.status === 403) {
        log(`   ⚠️  Admin access required (this is expected for non-admin users)`, 'yellow');
      } else {
        log(`   ❌ Failed to get stats: ${error.response?.data?.message || error.message}`, 'red');
      }
    }

    // 7b. Get all orders
    log('\n   📋 Getting all orders (admin)...', 'blue');
    try {
      const allOrdersResponse = await axios.get(`${API_URL}/api/orders/admin/all`, { headers });
      log(`   ✅ Found ${allOrdersResponse.data.orders.length} orders`, 'green');
    } catch (error) {
      if (error.response?.status === 403) {
        log(`   ⚠️  Admin access required`, 'yellow');
      } else {
        log(`   ❌ Failed to get all orders: ${error.response?.data?.message || error.message}`, 'red');
      }
    }

    // 7c. Update order status
    log('\n   ✏️  Updating order status (admin)...', 'blue');
    try {
      const statusResponse = await axios.put(
        `${API_URL}/api/orders/admin/${testOrderId}/status`,
        {
          status: 'confirmed',
          notes: 'Order confirmed by admin'
        },
        { headers }
      );
      log(`   ✅ Order status updated to: ${statusResponse.data.order.status}`, 'green');
    } catch (error) {
      if (error.response?.status === 403) {
        log(`   ⚠️  Admin access required`, 'yellow');
      } else {
        log(`   ❌ Failed to update status: ${error.response?.data?.message || error.message}`, 'red');
      }
    }

    log('\n' + '='.repeat(50), 'blue');
    log('✅ CART & ORDER API TEST COMPLETE!\n', 'green');

  } catch (error) {
    log(`\n❌ Test suite failed: ${error.message}`, 'red');
    console.error(error);
  }
}

// Run tests
testCartAndOrderAPI();
