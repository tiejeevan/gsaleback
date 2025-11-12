const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function setupSystemSettings() {
    try {
        console.log('Setting up system settings table...');

        // Read and execute migration SQL
        const migrationPath = path.join(__dirname, '../migrations/create_system_settings.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        await pool.query(migrationSQL);

        console.log('✅ System settings table created successfully');
        console.log('✅ Default password encryption setting added (enabled by default)');

        // Verify the setting
        const result = await pool.query(
            "SELECT * FROM system_settings WHERE setting_key = 'password_encryption_enabled'"
        );

        if (result.rows.length > 0) {
            console.log('\nCurrent setting:');
            console.log(`  Key: ${result.rows[0].setting_key}`);
            console.log(`  Value: ${result.rows[0].setting_value}`);
            console.log(`  Description: ${result.rows[0].description}`);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error setting up system settings:', err.message);
        process.exit(1);
    }
}

setupSystemSettings();
