// Script to check all tables in the database
const pool = require('../db');

async function checkTables() {
  try {
    console.log('🔍 Checking database tables...\n');

    // Get all tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log(`📊 Found ${tablesResult.rows.length} tables:\n`);
    
    for (const row of tablesResult.rows) {
      const tableName = row.table_name;
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📋 Table: ${tableName}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // Get columns for each table
      const columnsResult = await pool.query(`
        SELECT 
          column_name, 
          data_type, 
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_name = $1 
        ORDER BY ordinal_position;
      `, [tableName]);

      console.log('\nColumns:');
      columnsResult.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`  • ${col.column_name.padEnd(25)} ${col.data_type.padEnd(20)} ${nullable}${defaultVal}`);
      });

      // Get row count
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      console.log(`\n📈 Row count: ${countResult.rows[0].count}`);
    }

    console.log('\n\n✅ Database check complete!');
    
    // Check specifically for follow-related tables
    console.log('\n🔎 Checking for follow/follower tables...');
    const followTables = tablesResult.rows.filter(row => 
      row.table_name.includes('follow') || 
      row.table_name.includes('follower')
    );
    
    if (followTables.length > 0) {
      console.log('✅ Found follow-related tables:');
      followTables.forEach(t => console.log(`  • ${t.table_name}`));
    } else {
      console.log('❌ No follow/follower tables found');
      console.log('💡 You need to create a user_follows table to implement the follow feature');
    }

  } catch (err) {
    console.error('❌ Error checking tables:', err.message);
  } finally {
    await pool.end();
  }
}

checkTables();
