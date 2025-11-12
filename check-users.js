const pool = require('./db');

async function checkUsers() {
  try {
    const result = await pool.query('SELECT id, username FROM users ORDER BY id LIMIT 10');
    
    console.log('\n=== Users in Database ===\n');
    
    if (result.rows.length === 0) {
      console.log('❌ No users found!');
    } else {
      console.log(`✅ Found ${result.rows.length} users:\n`);
      result.rows.forEach(user => {
        console.log(`  ID: ${user.id}, Username: ${user.username}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkUsers();
