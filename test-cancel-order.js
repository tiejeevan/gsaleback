// Test script to verify order cancellation fix
const axios = require('axios');

const BASE_URL = 'http://localhost:5001/api';

async function testCancelOrder() {
  try {
    // You'll need to replace these with actual values
    const orderId = '4dee0389-e21a-443a-b123-8674f7088c1e';
    const token = 'YOUR_AUTH_TOKEN_HERE'; // Replace with actual token

    console.log(`Testing order cancellation for order: ${orderId}`);

    const response = await axios.put(
      `${BASE_URL}/orders/${orderId}/cancel`,
      { reason: 'Test cancellation' },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Success!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testCancelOrder();
