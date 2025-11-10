const pool = require('./db');

async function checkUsers() {
    try {
        const result = await pool.query('SELECT id, username, email, role FROM users ORDER BY id LIMIT 10');
        console.log('\n📋 Current Users in Database:');
        console.log('=====================================');
        if (result.rows.length === 0) {
            console.log('No users found. Please sign up first.');
        } else {
            result.rows.forEach(user => {
                console.log(`ID: ${user.id} | Username: ${user.username} | Email: ${user.email} | Role: ${user.role || 'user'}`);
            });
        }
        console.log('=====================================\n');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

checkUsers();
