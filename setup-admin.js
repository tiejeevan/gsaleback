// Quick setup script for admin system
// Run: node setup-admin.js

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Setting up Admin System...\n');

try {
    // Run migration
    console.log('📦 Running database migration...');
    execSync('node database/migrations/run-admin-migration.js', { 
        cwd: __dirname,
        stdio: 'inherit' 
    });
    
    console.log('\n✅ Admin system setup complete!\n');
    console.log('📝 To make a user admin, connect to your database and run:');
    console.log('   UPDATE users SET role = \'admin\' WHERE username = \'your_username\';\n');
    
} catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
}
