const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function setupWebAuthnTables() {
    try {
        console.log('Setting up WebAuthn database tables...');
        
        const sqlFile = path.join(__dirname, 'setup-webauthn-tables.sql');
        const sql = fs.readFileSync(sqlFile, 'utf8');
        
        await pool.query(sql);
        
        console.log('✅ WebAuthn tables created successfully!');
        console.log('Tables created:');
        console.log('  - webauthn_credentials');
        console.log('  - webauthn_challenges');
        console.log('  - webauthn_auth_challenges');
        
    } catch (error) {
        console.error('❌ Error setting up WebAuthn tables:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

setupWebAuthnTables();