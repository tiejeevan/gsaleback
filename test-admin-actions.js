const API_URL = 'http://localhost:5001/api';
let adminToken = '';
let testUserToken = '';
let testUserId = null;

// Test results tracker
const results = {
  passed: [],
  failed: []
};

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

// 1. Register test user
async function registerTestUser() {
  try {
    const response = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'test1',
        email: 'test1@test.com',
        password: '123456',
        first_name: 'Test',
        last_name: 'User'
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      testUserToken = data.token;
      testUserId = data.user.id;
      logTest('User Registration', true, `User created with ID: ${testUserId}`);
      return true;
    } else if (response.status === 400 && (data.msg || data.error || '').includes('already exists')) {
      // User exists, try to login
      return await loginTestUser();
    } else {
      logTest('User Registration', false, data.error || data.msg || 'Unknown error');
      return false;
    }
  } catch (err) {
    logTest('User Registration', false, err.message);
    return false;
  }
}

// 2. Login test user
async function loginTestUser() {
  try {
    const response = await fetch(`${API_URL}/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'test1',
        password: '123456'
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      testUserToken = data.token;
      testUserId = data.user.id;
      logTest('User Login', true, `Logged in successfully`);
      return true;
    } else {
      logTest('User Login', false, data.error);
      return false;
    }
  } catch (err) {
    logTest('User Login', false, err.message);
    return false;
  }
}

// 3. Login as admin
async function loginAsAdmin() {
  try {
    const response = await fetch(`${API_URL}/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'dev',
        password: '123456'
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      adminToken = data.token;
      logTest('Admin Login', true, 'Admin logged in successfully');
      return true;
    } else {
      logTest('Admin Login', false, data.error || data.msg || 'Login failed');
      return false;
    }
  } catch (err) {
    logTest('Admin Login', false, err.message);
    return false;
  }
}

// 4. Test creating a post (should work when active)
async function testCreatePost() {
  try {
    const response = await fetch(`${API_URL}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      },
      body: JSON.stringify({
        content: 'Test post from test1 user'
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      logTest('Create Post (Active)', true, 'Post created successfully');
      return data.id;
    } else {
      logTest('Create Post (Active)', false, data.error || data.message);
      return null;
    }
  } catch (err) {
    logTest('Create Post (Active)', false, err.message);
    return null;
  }
}

// 5. Mute user
async function muteUser() {
  try {
    const response = await fetch(`${API_URL}/admin/users/${testUserId}/mute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        reason: 'Testing mute functionality'
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      logTest('Mute User', true, 'User muted successfully');
      return true;
    } else {
      logTest('Mute User', false, data.error);
      return false;
    }
  } catch (err) {
    logTest('Mute User', false, err.message);
    return false;
  }
}

// 6. Test creating post while muted (should fail)
async function testCreatePostWhileMuted() {
  try {
    const response = await fetch(`${API_URL}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      },
      body: JSON.stringify({
        content: 'This should not work - user is muted'
      })
    });

    const data = await response.json();
    
    if (response.status === 403 && data.error === 'Account muted') {
      logTest('Create Post (Muted)', true, 'Correctly blocked muted user from posting');
      return true;
    } else if (response.ok) {
      logTest('Create Post (Muted)', false, 'Muted user was able to create post - BUG!');
      return false;
    } else {
      logTest('Create Post (Muted)', false, `Unexpected error: ${data.error}`);
      return false;
    }
  } catch (err) {
    logTest('Create Post (Muted)', false, err.message);
    return false;
  }
}

// 7. Test reading posts while muted (should work)
async function testReadPostsWhileMuted() {
  try {
    const response = await fetch(`${API_URL}/posts`, {
      headers: {
        'Authorization': `Bearer ${testUserToken}`
      }
    });

    if (response.ok) {
      logTest('Read Posts (Muted)', true, 'Muted user can still read posts');
      return true;
    } else {
      logTest('Read Posts (Muted)', false, 'Muted user cannot read posts - BUG!');
      return false;
    }
  } catch (err) {
    logTest('Read Posts (Muted)', false, err.message);
    return false;
  }
}

// 8. Unmute user
async function unmuteUser() {
  try {
    const response = await fetch(`${API_URL}/admin/users/${testUserId}/unmute`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await response.json();
    
    if (response.ok) {
      logTest('Unmute User', true, 'User unmuted successfully');
      return true;
    } else {
      logTest('Unmute User', false, data.error);
      return false;
    }
  } catch (err) {
    logTest('Unmute User', false, err.message);
    return false;
  }
}

// 9. Suspend user
async function suspendUser() {
  try {
    const response = await fetch(`${API_URL}/admin/users/${testUserId}/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        reason: 'Testing suspend functionality'
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      logTest('Suspend User', true, 'User suspended successfully');
      return true;
    } else {
      logTest('Suspend User', false, data.error);
      return false;
    }
  } catch (err) {
    logTest('Suspend User', false, err.message);
    return false;
  }
}

// 10. Test accessing API while suspended (should fail)
async function testAccessWhileSuspended() {
  try {
    const response = await fetch(`${API_URL}/posts`, {
      headers: {
        'Authorization': `Bearer ${testUserToken}`
      }
    });

    const data = await response.json();
    
    if (response.status === 403 && data.error === 'Account suspended') {
      logTest('Access API (Suspended)', true, 'Correctly blocked suspended user');
      return true;
    } else if (response.ok) {
      logTest('Access API (Suspended)', false, 'Suspended user can still access API - BUG!');
      return false;
    } else {
      logTest('Access API (Suspended)', false, `Unexpected error: ${data.error}`);
      return false;
    }
  } catch (err) {
    logTest('Access API (Suspended)', false, err.message);
    return false;
  }
}

// 11. Unsuspend user
async function unsuspendUser() {
  try {
    const response = await fetch(`${API_URL}/admin/users/${testUserId}/unsuspend`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await response.json();
    
    if (response.ok) {
      logTest('Unsuspend User', true, 'User unsuspended successfully');
      return true;
    } else {
      logTest('Unsuspend User', false, data.error);
      return false;
    }
  } catch (err) {
    logTest('Unsuspend User', false, err.message);
    return false;
  }
}

// 12. Soft delete user
async function softDeleteUser() {
  try {
    const response = await fetch(`${API_URL}/admin/users/${testUserId}/soft`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        reason: 'Testing soft delete functionality'
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      logTest('Soft Delete User', true, 'User soft deleted successfully');
      return true;
    } else {
      logTest('Soft Delete User', false, data.error);
      return false;
    }
  } catch (err) {
    logTest('Soft Delete User', false, err.message);
    return false;
  }
}

// 13. Test accessing API while deleted (should fail)
async function testAccessWhileDeleted() {
  try {
    const response = await fetch(`${API_URL}/posts`, {
      headers: {
        'Authorization': `Bearer ${testUserToken}`
      }
    });

    const data = await response.json();
    
    if (response.status === 403 && data.error === 'Account has been deleted') {
      logTest('Access API (Deleted)', true, 'Correctly blocked deleted user');
      return true;
    } else if (response.ok) {
      logTest('Access API (Deleted)', false, 'Deleted user can still access API - BUG!');
      return false;
    } else {
      logTest('Access API (Deleted)', false, `Unexpected error: ${data.error}`);
      return false;
    }
  } catch (err) {
    logTest('Access API (Deleted)', false, err.message);
    return false;
  }
}

// 14. Restore user
async function restoreUser() {
  try {
    const response = await fetch(`${API_URL}/admin/users/${testUserId}/restore`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await response.json();
    
    if (response.ok) {
      logTest('Restore User', true, 'User restored successfully');
      return true;
    } else {
      logTest('Restore User', false, data.error);
      return false;
    }
  } catch (err) {
    logTest('Restore User', false, err.message);
    return false;
  }
}

// 15. Test accessing API after restore (should work)
async function testAccessAfterRestore() {
  try {
    const response = await fetch(`${API_URL}/posts`, {
      headers: {
        'Authorization': `Bearer ${testUserToken}`
      }
    });

    if (response.ok) {
      logTest('Access API (Restored)', true, 'Restored user can access API again');
      return true;
    } else {
      logTest('Access API (Restored)', false, 'Restored user cannot access API');
      return false;
    }
  } catch (err) {
    logTest('Access API (Restored)', false, err.message);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('\n🧪 Starting Admin Actions Test Suite\n');
  console.log('=' .repeat(60));
  
  // Setup
  if (!await registerTestUser()) return;
  await sleep(500);
  
  if (!await loginAsAdmin()) return;
  await sleep(500);
  
  // Test active user
  console.log('\n📝 Testing Active User...');
  await testCreatePost();
  await sleep(500);
  
  // Test muted user
  console.log('\n🔇 Testing Muted User...');
  await muteUser();
  await sleep(500);
  await testCreatePostWhileMuted();
  await sleep(500);
  await testReadPostsWhileMuted();
  await sleep(500);
  await unmuteUser();
  await sleep(500);
  
  // Test suspended user
  console.log('\n🚫 Testing Suspended User...');
  await suspendUser();
  await sleep(500);
  await testAccessWhileSuspended();
  await sleep(500);
  await unsuspendUser();
  await sleep(500);
  
  // Test deleted user
  console.log('\n🗑️  Testing Deleted User...');
  await softDeleteUser();
  await sleep(500);
  await testAccessWhileDeleted();
  await sleep(500);
  await restoreUser();
  await sleep(500);
  await testAccessAfterRestore();
  
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
    console.log('\n🎉 ALL TESTS PASSED! 🎉');
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
}

// Run the tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
