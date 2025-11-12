// Script to create user_addresses table
require('dotenv').config();
const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function createUserAddressesTable() {
  const client = await pool.connect();
  
  try {
    console.log('🏗️  Creating user_addresses table...\n');

    // Read and execute SQL file
    const sqlFile = path.join(__dirname, 'create-user-addresses-table.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    await client.query(sql);
    
    console.log('✅ user_addresses table created successfully!\n');

    // Verify table
    const result = await client.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'user_addresses'
      ORDER BY ordinal_position
    `);

    console.log('📋 Table structure:');
    result.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(required)' : ''}`);
    });
    console.log();

  } catch (error) {
    console.error('❌ Error creating table:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run
createUserAddressesTable()
  .then(() => {
    console.log('✅ Setup complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
