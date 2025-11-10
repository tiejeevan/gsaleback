const pool = require('../../db');
const fs = require('fs');
const path = require('path');

async function runAdminMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Starting admin system migration...');
        
        const sql = fs.readFileSync(
            path.join(__dirname, 'add-admin-system.sql'),
            'utf8'
        );
        
        await client.query(sql);
        
        console.log('✅ Admin system migration completed successfully!');
        console.log('');
        console.log('📝 Next steps:');
        console.log('   1. To make a user admin, run this SQL:');
        console.log('      UPDATE users SET role = \'admin\' WHERE username = \'your_username\';');
        console.log('');
        console.log('   2. Admin users can now access /admin dashboard');
        console.log('');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

runAdminMigration();
