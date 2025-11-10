const pool = require('./db');

async function checkAdmins() {
    try {
        const result = await pool.query("SELECT id, username, email, role FROM users WHERE role = 'admin'");
        
        console.log('\n👑 Admin Users in Database:');
        console.log('=====================================');
        
        if (result.rows.length === 0) {
            console.log('❌ No admin users found.');
            console.log('\nTo create an admin user, run:');
            console.log('node make-admin.js <username>');
        } else {
            result.rows.forEach(user => {
                console.log(`✅ Username: ${user.username}`);
                console.log(`   Email: ${user.email}`);
                console.log(`   ID: ${user.id}`);
                console.log('---');
            });
        }
        
        console.log('=====================================\n');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

checkAdmins();
