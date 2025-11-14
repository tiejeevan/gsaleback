// Add gamification settings to system_settings table
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../db');

async function addSettings() {
  console.log('⚙️  Adding Gamification Settings...\n');
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const settings = [
      {
        key: 'gamification_enabled',
        value: 'false',
        desc: 'Master switch for gamification system (enable/disable all features)'
      },
      {
        key: 'gamification_xp_enabled',
        value: 'true',
        desc: 'Enable XP earning system'
      },
      {
        key: 'gamification_badges_enabled',
        value: 'true',
        desc: 'Enable badge system'
      },
      {
        key: 'gamification_leaderboards_enabled',
        value: 'true',
        desc: 'Enable leaderboards'
      },
      {
        key: 'gamification_reputation_enabled',
        value: 'true',
        desc: 'Enable reputation system'
      },
      {
        key: 'gamification_seasonal_events_enabled',
        value: 'false',
        desc: 'Enable seasonal events'
      },
      {
        key: 'gamification_xp_multiplier',
        value: '1.0',
        desc: 'Global XP multiplier for events (1.0 = normal, 2.0 = double XP)'
      },
      {
        key: 'gamification_leaderboard_update_interval',
        value: '3600',
        desc: 'Leaderboard cache update interval in seconds (default: 1 hour)'
      },
      {
        key: 'gamification_level_formula',
        value: 'sqrt',
        desc: 'Level calculation formula: sqrt or linear'
      },
      {
        key: 'gamification_auto_badge_check',
        value: 'true',
        desc: 'Automatically check and award badges on user actions'
      }
    ];
    
    console.log('📝 Inserting settings...\n');
    
    for (const setting of settings) {
      const result = await client.query(`
        INSERT INTO system_settings (setting_key, setting_value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (setting_key) 
        DO UPDATE SET description = EXCLUDED.description
        RETURNING setting_key, setting_value
      `, [setting.key, setting.value, setting.desc]);
      
      console.log(`   ✓ ${result.rows[0].setting_key} = ${result.rows[0].setting_value}`);
    }
    
    await client.query('COMMIT');
    
    console.log('\n✅ Gamification settings added successfully!\n');
    
    // Show all gamification settings
    const allSettings = await client.query(`
      SELECT setting_key, setting_value, description 
      FROM system_settings 
      WHERE setting_key LIKE 'gamification_%'
      ORDER BY setting_key
    `);
    
    console.log('📊 Current Gamification Settings:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    allSettings.rows.forEach(row => {
      console.log(`${row.setting_key.padEnd(45)} = ${row.setting_value.padEnd(10)} | ${row.description}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('💡 Note: Gamification is DISABLED by default.');
    console.log('   To enable, set gamification_enabled = true in admin dashboard\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to add settings:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addSettings();
