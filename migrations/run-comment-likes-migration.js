const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function runMigration() {
    try {
        console.log('🚀 Running comment_likes table migration...');
        
        // Read the SQL file
        const sqlPath = path.join(__dirname, 'create_comment_likes_table.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Execute the migration
        await pool.query(sql);
        
        console.log('✅ comment_likes table migration completed successfully!');
        
        // Verify the table was created
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'comment_likes'
        `);
        
        if (result.rows.length > 0) {
            console.log('✅ comment_likes table verified in database');
        } else {
            console.log('❌ comment_likes table not found after migration');
        }
        
        // Show table structure
        const columns = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'comment_likes'
            ORDER BY ordinal_position
        `);
        
        console.log('\n📋 Table structure:');
        columns.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
        });
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run the migration
runMigration();