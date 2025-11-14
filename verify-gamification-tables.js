// Quick verification script
require('dotenv').config();
const pool = require('./db');

async function verify() {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'user_gamification', 'xp_rules', 'xp_transactions', 'badges', 'user_badges',
        'achievements', 'leaderboards', 'reputation_scores', 'seasonal_events',
        'gamification_actions', 'gamification_events_log', 'admin_gamification_logs'
      )
      ORDER BY table_name
    `);
    
    console.log(`\n✅ Found ${result.rows.length}/12 gamification tables:\n`);
    result.rows.forEach((row, i) => console.log(`${i+1}. ${row.table_name}`));
    
    // Check data
    const xpCount = await pool.query('SELECT COUNT(*) FROM xp_rules');
    const badgeCount = await pool.query('SELECT COUNT(*) FROM badges');
    const settingsCount = await pool.query("SELECT COUNT(*) FROM system_settings WHERE setting_key LIKE 'gamification_%'");
    
    console.log(`\n📊 Data:`);
    console.log(`   XP Rules: ${xpCount.rows[0].count}`);
    console.log(`   Badges: ${badgeCount.rows[0].count}`);
    console.log(`   Settings: ${settingsCount.rows[0].count}\n`);
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
  }
}

verify();
