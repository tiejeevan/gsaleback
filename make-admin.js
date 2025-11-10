const pool = require('./db');

async function makeAdmin() {
    const username = process.argv[2];
    
    if (!username) {
        console.log('\n❌ Usage: node make-admin.js <username>');
        console.log('\nExample: node make-admin.js king\n');
        process.exit(1);
    }

    try {
        // Check if user exists
        const checkUser = await pool.query('SELECT id, username, email, role FROM users WHERE username = $1', [username]);
        
        if (checkUser.rows.length === 0) {
            console.log(`\n❌ User '${username}' not found.\n`);
            process.exit(1);
        }

        const user = checkUser.rows[0];
        
        if (user.role === 'admin') {
            console.log(`\n✅ User '${username}' is already an admin.\n`);
            process.exit(0);
        }

        // Make user admin
        await pool.query('UPDATE users SET role = $1 WHERE username = $2', ['admin', username]);
        
        console.log('\n✅ SUCCESS!');
        console.log('=====================================');
        console.log(`User: ${user.username}`);
        console.log(`Email: ${user.email}`);
        console.log(`Role: user → admin`);
        console.log('=====================================');
        console.log('\n🎉 User is now an admin!');
        console.log('\n📝 Next steps:');
        console.log('   1. Restart your backend server');
        console.log('   2. Login with this user');
        console.log('   3. Visit /admin in your app\n');
        
    } catch (err) {
        console.error('\n❌ Error:', err.message, '\n');
    } finally {
        await pool.end();
    }
}

makeAdmin();
