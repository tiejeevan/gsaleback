const bcrypt = require('bcryptjs');
const pool = require('./db');

async function createTestUser() {
  try {
    const hashedPassword = await bcrypt.hash('123456', 10);
    
    const result = await pool.query(
      `INSERT INTO users (username, email, password, first_name, last_name, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, username, email, role, status`,
      ['test1', 'test1@test.com', hashedPassword, 'Test', 'User', 'user', 'active']
    );
    
    console.log('✅ Test user created successfully:');
    console.log(JSON.stringify(result.rows[0], null, 2));
    await pool.end();
    process.exit(0);
  } catch (err) {
    if (err.code === '23505') {
      console.log('⚠️  User already exists, fetching existing user...');
      const existing = await pool.query('SELECT id, username, email, role, status FROM users WHERE username = $1', ['test1']);
      console.log(JSON.stringify(existing.rows[0], null, 2));
      await pool.end();
      process.exit(0);
    } else {
      console.error('❌ Error:', err.message);
      console.error('Stack:', err.stack);
      await pool.end();
      process.exit(1);
    }
  }
}

createTestUser();
