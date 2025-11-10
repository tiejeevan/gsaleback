const io = require('socket.io-client');

const API_URL = 'http://localhost:5001/api';
const SOCKET_URL = 'http://localhost:5001';

// Test results tracker
const results = {
  passed: [],
  failed: []
};

let user1Token = '';
let user2Token = '';
let user1Id = null;
let user2Id = null;
let user1Socket = null;
let user2Socket = null;
let testPostId = null;

function logTest(name, passed, message) {
  if (passed) {
    results.passed.push(name);
    console.log(`✅ ${name}: ${message}`);
  } else {
    results.failed.push(name);
    console.log(`❌ ${name}: ${message}`);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Create test users
async function createTestUsers() {
  try {
    // Create user1
    const user1Response = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'rttest1',
        email: 'rttest1@test.com',
        password: '123456',
        first_name: 'RealTime',
        last_name: 'User1'
      })
    });

    if (user1Response.ok) {
      const data = await user1Response.json();
      user1Token = data.token;
      user1Id = data.user.id;
      logTest('Create User 1', true, `User1 created with ID: ${user1Id}`);
    } else {
      // Try login if exists
      const loginResponse = await fetch(`${API_URL}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'rttest1', password: '123456' })
      });
      const data = await loginResponse.json();
      user1Token = data.token;
      user1Id = data.user.id;
      logTest('Create User 1', true, `User1 logged in with ID: ${user1Id}`);
    }

    await sleep(500);

    // Create user2
    const user2Response = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'rttest2',
        email: 'rttest2@test.com',
        password: '123456',
        first_name: 'RealTime',
        last_name: 'User2'
      })
    });

    if (user2Response.ok) {
      const data = await user2Response.json();
      user2Token = data.token;
      user2Id = data.user.id;
      logTest('Create User 2', true, `User2 created with ID: ${user2Id}`);
    } else {
      // Try login if exists
      const loginResponse = await fetch(`${API_URL}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'rttest2', password: '123456' })
      });
      const data = await loginResponse.json();
      user2Token = data.token;
      user2Id = data.user.id;
      logTest('Create User 2', true, `User2 logged in with ID: ${user2Id}`);
    }

    return true;
  } catch (err) {
    logTest('Create Test Users', false, err.message);
    return false;
  }
}

// Setup socket connections
async function setupSockets() {
  return new Promise((resolve) => {
    let connectedCount = 0;

    user1Socket = io(SOCKET_URL, {
      auth: { token: user1Token },
      transports: ['websocket']
    });

    user2Socket = io(SOCKET_URL, {
      auth: { token: user2Token },
      transports: ['websocket']
    });

    user1Socket.on('connect', () => {
      console.log('🔌 User1 socket connected');
      user1Socket.emit('join', `user_${user1Id}`);
      connectedCount++;
      if (connectedCount === 2) {
        logTest('Socket Connections', true, 'Both users connected');
        resolve(true);
      }
    });

    user2Socket.on('connect', () => {
      console.log('🔌 User2 socket connected');
      user2Socket.emit('join', `user_${user2Id}`);
      connectedCount++;
      if (connectedCount === 2) {
        logTest('Socket Connections', true, 'Both users connected');
        resolve(true);
      }
    });

    user1Socket.on('connect_error', (err) => {
      logTest('Socket Connections', false, `User1 connection error: ${err.message}`);
      resolve(false);
    });

    user2Socket.on('connect_error', (err) => {
      logTest('Socket Connections', false, `User2 connection error: ${err.message}`);
      resolve(false);
    });

    setTimeout(() => {
      if (connectedCount < 2) {
        logTest('Socket Connections', false, 'Timeout waiting for connections');
        resolve(false);
      }
    }, 5000);
  });
}

// Test 1: Real-time post creation
async function testPostCreation() {
  return new Promise(async (resolve) => {
    let notificationReceived = false;

    // User2 listens for new posts
    user2Socket.once('post:new', (data) => {
      notificationReceived = true;
      logTest('Real-time Post Creation', true, `User2 received new post notification`);
      resolve(true);
    });

    // User1 creates a post
    const response = await fetch(`${API_URL}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user1Token}`
      },
      body: JSON.stringify({
        content: 'Test post for real-time notifications @rttest2'
      })
    });

    if (response.ok) {
      const data = await response.json();
      testPostId = data.id;
      console.log(`📝 Post created with ID: ${testPostId}`);
    }

    setTimeout(() => {
      if (!notificationReceived) {
        logTest('Real-time Post Creation', false, 'No notification received');
        resolve(false);
      }
    }, 3000);
  });
}

// Test 2: Real-time comment notifications
async function testCommentNotifications() {
  return new Promise(async (resolve) => {
    let notificationReceived = false;

    // User1 joins the post room
    user1Socket.emit('join', `post_${testPostId}`);
    await sleep(500);

    // User1 listens for comment notifications
    user1Socket.once('notification:new', (data) => {
      if (data.type === 'comment') {
        notificationReceived = true;
        logTest('Comment Notification', true, `User1 received comment notification`);
        resolve(true);
      }
    });

    // User2 comments on User1's post
    const response = await fetch(`${API_URL}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user2Token}`
      },
      body: JSON.stringify({
        post_id: testPostId,
        content: 'Great post! This is a test comment.'
      })
    });

    if (response.ok) {
      console.log(`💬 Comment created on post ${testPostId}`);
    }

    setTimeout(() => {
      if (!notificationReceived) {
        logTest('Comment Notification', false, 'No notification received');
        resolve(false);
      }
    }, 3000);
  });
}

// Test 3: Real-time comment updates
async function testCommentRealtime() {
  return new Promise(async (resolve) => {
    let commentReceived = false;

    // Both users join the post room
    user1Socket.emit('join', `post_${testPostId}`);
    user2Socket.emit('join', `post_${testPostId}`);
    await sleep(500);

    // User1 listens for new comments
    const eventName = `post_${testPostId}:comment:new`;
    user1Socket.once(eventName, (data) => {
      commentReceived = true;
      logTest('Real-time Comment Update', true, `User1 received real-time comment`);
      resolve(true);
    });

    // User2 adds another comment
    const response = await fetch(`${API_URL}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user2Token}`
      },
      body: JSON.stringify({
        post_id: testPostId,
        content: 'Another comment for real-time testing'
      })
    });

    if (response.ok) {
      console.log(`💬 Second comment created`);
    }

    setTimeout(() => {
      if (!commentReceived) {
        logTest('Real-time Comment Update', false, 'No real-time update received');
        resolve(false);
      }
    }, 3000);
  });
}

// Test 4: Mention notifications
async function testMentionNotifications() {
  return new Promise(async (resolve) => {
    let mentionReceived = false;

    // User2 listens for mention notifications
    user2Socket.once('notification:new', (data) => {
      if (data.type === 'mention') {
        mentionReceived = true;
        logTest('Mention Notification', true, `User2 received mention notification`);
        resolve(true);
      }
    });

    // User1 creates a post mentioning User2
    const response = await fetch(`${API_URL}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user1Token}`
      },
      body: JSON.stringify({
        content: 'Hey @rttest2, check this out! Testing mentions.'
      })
    });

    if (response.ok) {
      console.log(`📝 Post with mention created`);
    }

    setTimeout(() => {
      if (!mentionReceived) {
        logTest('Mention Notification', false, 'No mention notification received');
        resolve(false);
      }
    }, 3000);
  });
}

// Test 5: Like notifications
async function testLikeNotifications() {
  return new Promise(async (resolve) => {
    let likeReceived = false;

    // User1 listens for like notifications
    user1Socket.once('notification:new', (data) => {
      if (data.type === 'like') {
        likeReceived = true;
        logTest('Like Notification', true, `User1 received like notification`);
        resolve(true);
      }
    });

    // User2 likes User1's post
    const response = await fetch(`${API_URL}/likes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user2Token}`
      },
      body: JSON.stringify({
        target_type: 'post',
        target_id: testPostId
      })
    });

    if (response.ok) {
      console.log(`❤️ Post liked`);
    }

    setTimeout(() => {
      if (!likeReceived) {
        logTest('Like Notification', false, 'No like notification received');
        resolve(false);
      }
    }, 3000);
  });
}

// Test 6: Follow notifications
async function testFollowNotifications() {
  return new Promise(async (resolve) => {
    let followReceived = false;

    // User1 listens for follow notifications
    user1Socket.once('notification:new', (data) => {
      if (data.type === 'follow') {
        followReceived = true;
        logTest('Follow Notification', true, `User1 received follow notification`);
        resolve(true);
      }
    });

    // User2 follows User1
    const response = await fetch(`${API_URL}/follows/${user1Id}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user2Token}`
      }
    });

    if (response.ok) {
      console.log(`👥 User2 followed User1`);
    }

    setTimeout(() => {
      if (!followReceived) {
        logTest('Follow Notification', false, 'No follow notification received');
        resolve(false);
      }
    }, 3000);
  });
}

// Cleanup
function cleanup() {
  if (user1Socket) user1Socket.disconnect();
  if (user2Socket) user2Socket.disconnect();
}

// Main test runner
async function runTests() {
  console.log('\n🧪 Starting Real-Time Features Test Suite\n');
  console.log('=' .repeat(60));
  
  // Setup
  if (!await createTestUsers()) {
    console.log('\n❌ Failed to create test users. Exiting.');
    return;
  }
  
  await sleep(1000);
  
  if (!await setupSockets()) {
    console.log('\n❌ Failed to setup socket connections. Exiting.');
    return;
  }
  
  await sleep(1000);
  
  // Run tests
  console.log('\n📝 Testing Real-Time Features...\n');
  
  await testPostCreation();
  await sleep(1000);
  
  await testCommentNotifications();
  await sleep(1000);
  
  await testCommentRealtime();
  await sleep(1000);
  
  await testMentionNotifications();
  await sleep(1000);
  
  await testLikeNotifications();
  await sleep(1000);
  
  await testFollowNotifications();
  await sleep(1000);
  
  // Cleanup
  cleanup();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 TEST SUMMARY\n');
  console.log(`✅ Passed: ${results.passed.length}/${results.passed.length + results.failed.length}`);
  console.log(`❌ Failed: ${results.failed.length}/${results.passed.length + results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    results.failed.forEach(test => console.log(`   - ${test}`));
  }
  
  if (results.failed.length === 0) {
    console.log('\n🎉 ALL REAL-TIME TESTS PASSED! 🎉');
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  process.exit(results.failed.length === 0 ? 0 : 1);
}

// Run the tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  cleanup();
  process.exit(1);
});
