// Script to run the follow system migration
const pool = require('../../db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Starting follow system migration...\n');
        
        await client.query('BEGIN');
        
        // Read the SQL migration file
        const sqlPath = path.join(__dirname, 'add-follow-system.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Execute the migration
        await client.query(sql);
        
        await client.query('COMMIT');
        
        console.log('\n✅ Migration completed successfully!');
        console.log('\n📊 Verifying tables...');
        
        // Verify the table was created
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'user_follows'
            );
        `);
        
        if (tableCheck.rows[0].exists) {
            console.log('✅ user_follows table created');
            
            // Check columns
            const columnCheck = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'user_follows'
                ORDER BY ordinal_position;
            `);
            
            console.log('📋 Columns:', columnCheck.rows.map(r => r.column_name).join(', '));
        }
        
        // Verify users table columns
        const userColumnsCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name IN ('follower_count', 'following_count');
        `);
        
        if (userColumnsCheck.rows.length === 2) {
            console.log('✅ follower_count and following_count columns added to users table');
        }
        
        // Check trigger
        const triggerCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM pg_trigger 
                WHERE tgname = 'trigger_update_follow_counts'
            );
        `);
        
        if (triggerCheck.rows[0].exists) {
            console.log('✅ trigger_update_follow_counts created');
        }
        
        // Check view
        const viewCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.views 
                WHERE table_name = 'user_follow_details'
            );
        `);
        
        if (viewCheck.rows[0].exists) {
            console.log('✅ user_follow_details view created');
        }
        
        console.log('\n🎉 Follow system is ready to use!');
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', err.message);
        console.error(err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
