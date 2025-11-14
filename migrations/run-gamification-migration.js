// Run gamification database migration
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🎮 Starting Gamification System Migration...\n');
  console.log('Connecting to database...');
  const client = await pool.connect();
  
  try {
    console.log('✅ Connected to database\n');
    console.log('📋 Reading migration file...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'create_gamification_tables.sql'),
      'utf8'
    );
    
    console.log('✅ Migration file loaded\n');
    console.log('🚀 Executing migration (this may take a moment)...\n');
    
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!\n');
    
    // Verify the changes
    console.log('🔍 Verifying tables...\n');
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'user_gamification', 'xp_rules', 'xp_transactions', 'badges', 'user_badges',
        'achievements', 'leaderboards', 'reputation_scores', 'seasonal_events',
        'gamification_actions', 'gamification_events_log', 'admin_gamification_logs'
      )
      ORDER BY table_name;
    `);
    
    console.log('📊 Created Tables:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ✓ ${row.table_name}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (result.rows.length === 12) {
      console.log('🎉 SUCCESS! All 12 gamification tables created!\n');
    } else {
      console.log(`⚠️  Warning: Expected 12 tables, but found ${result.rows.length}\n`);
    }
    
    // Check row counts
    console.log('📈 Checking row counts...\n');
    const countResult = await client.query(`
      SELECT 
        'user_gamification' as table_name, COUNT(*) as row_count FROM user_gamification
      UNION ALL
      SELECT 'xp_rules', COUNT(*) FROM xp_rules
      UNION ALL
      SELECT 'xp_transactions', COUNT(*) FROM xp_transactions
      UNION ALL
      SELECT 'badges', COUNT(*) FROM badges
      UNION ALL
      SELECT 'user_badges', COUNT(*) FROM user_badges
      UNION ALL
      SELECT 'achievements', COUNT(*) FROM achievements
      UNION ALL
      SELECT 'leaderboards', COUNT(*) FROM leaderboards
      UNION ALL
      SELECT 'reputation_scores', COUNT(*) FROM reputation_scores
      UNION ALL
      SELECT 'seasonal_events', COUNT(*) FROM seasonal_events
      UNION ALL
      SELECT 'gamification_actions', COUNT(*) FROM gamification_actions
      UNION ALL
      SELECT 'gamification_events_log', COUNT(*) FROM gamification_events_log
      UNION ALL
      SELECT 'admin_gamification_logs', COUNT(*) FROM admin_gamification_logs
      ORDER BY table_name;
    `);
    
    console.table(countResult.rows);
    
    console.log('\n✅ Migration verification complete!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Run seed data: node migrations/seed-gamification-data.js');
    console.log('   2. Update system settings: node migrations/add-gamification-settings.js');
    console.log('   3. Test the system: node test-gamification.js\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('\nError details:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
