// services/gamificationService.js
const pool = require('../db');

class GamificationService {
  // Check if gamification is enabled (master switch)
  async isEnabled() {
    try {
      const result = await pool.query(
        `SELECT setting_value FROM system_settings WHERE setting_key = 'gamification_enabled'`
      );
      
      // If setting doesn't exist, default to enabled
      if (result.rows.length === 0) {
        console.log('⚠️ Gamification setting not found in DB, defaulting to ENABLED');
        return true;
      }
      
      const settingValue = result.rows[0].setting_value;
      const isEnabled = settingValue === 'true';
      console.log(`🎮 Gamification setting found: value="${settingValue}", enabled=${isEnabled}`);
      return isEnabled;
    } catch (err) {
      console.error('Error checking gamification status:', err);
      // Default to enabled on error
      return true;
    }
  }

  // Get all gamification settings
  async getSettings() {
    try {
      const result = await pool.query(
        `SELECT setting_key, setting_value, description 
         FROM system_settings 
         WHERE setting_key LIKE 'gamification_%'
         ORDER BY setting_key`
      );
      
      const settings = {};
      result.rows.forEach(row => {
        const key = row.setting_key.replace('gamification_', '');
        settings[key] = row.setting_value;
      });
      
      return settings;
    } catch (err) {
      console.error('Error fetching gamification settings:', err);
      throw err;
    }
  }

  // Initialize user gamification profile
  async initializeUser(userId) {
    try {
      const existing = await pool.query(
        `SELECT id FROM user_gamification WHERE user_id = $1`,
        [userId]
      );

      if (existing.rows.length > 0) {
        return existing.rows[0];
      }

      const result = await pool.query(
        `INSERT INTO user_gamification (user_id, total_xp, current_level, total_reputation)
         VALUES ($1, 0, 1, 0)
         RETURNING *`,
        [userId]
      );

      return result.rows[0];
    } catch (err) {
      console.error('Error initializing user gamification:', err);
      throw err;
    }
  }

  // Get user gamification profile
  async getUserProfile(userId) {
    try {
      const result = await pool.query(
        `SELECT ug.*, u.username, u.first_name, u.last_name, u.profile_image
         FROM user_gamification ug
         JOIN users u ON ug.user_id = u.id
         WHERE ug.user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        // Initialize if doesn't exist
        await this.initializeUser(userId);
        return this.getUserProfile(userId);
      }

      const profile = result.rows[0];

      // Get badges
      const badgesResult = await pool.query(
        `SELECT b.*, ub.earned_at, ub.progress_data
         FROM user_badges ub
         JOIN badges b ON ub.badge_id = b.id
         WHERE ub.user_id = $1
         ORDER BY ub.earned_at DESC`,
        [userId]
      );

      profile.badges = badgesResult.rows;

      // Get recent XP transactions
      const xpResult = await pool.query(
        `SELECT * FROM xp_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [userId]
      );

      profile.recent_xp = xpResult.rows;

      return profile;
    } catch (err) {
      console.error('Error fetching user gamification profile:', err);
      throw err;
    }
  }

  // Get system statistics (for admin dashboard)
  async getSystemStats() {
    try {
      const stats = {};

      // Total users with gamification
      const usersResult = await pool.query(
        `SELECT COUNT(*) as total FROM user_gamification`
      );
      stats.total_users = parseInt(usersResult.rows[0].total);

      // Total XP awarded
      const xpResult = await pool.query(
        `SELECT SUM(xp_amount) as total FROM xp_transactions WHERE xp_amount > 0`
      );
      stats.total_xp_awarded = parseInt(xpResult.rows[0].total) || 0;

      // Total badges awarded
      const badgesResult = await pool.query(
        `SELECT COUNT(*) as total FROM user_badges`
      );
      stats.total_badges_awarded = parseInt(badgesResult.rows[0].total);

      // Average level
      const levelResult = await pool.query(
        `SELECT AVG(current_level) as avg FROM user_gamification`
      );
      stats.average_level = parseFloat(levelResult.rows[0].avg) || 1;

      // Top level users
      const topUsersResult = await pool.query(
        `SELECT u.username, ug.current_level, ug.total_xp
         FROM user_gamification ug
         JOIN users u ON ug.user_id = u.id
         ORDER BY ug.current_level DESC, ug.total_xp DESC
         LIMIT 10`
      );
      stats.top_users = topUsersResult.rows;

      // Most awarded badges
      const topBadgesResult = await pool.query(
        `SELECT b.name, b.rarity, COUNT(*) as awarded_count
         FROM user_badges ub
         JOIN badges b ON ub.badge_id = b.id
         GROUP BY b.id, b.name, b.rarity
         ORDER BY awarded_count DESC
         LIMIT 10`
      );
      stats.top_badges = topBadgesResult.rows;

      return stats;
    } catch (err) {
      console.error('Error fetching system stats:', err);
      throw err;
    }
  }

  // Check if specific feature is enabled
  async isFeatureEnabled(feature) {
    try {
      const masterEnabled = await this.isEnabled();
      if (!masterEnabled) return false;

      const result = await pool.query(
        `SELECT setting_value FROM system_settings WHERE setting_key = $1`,
        [`gamification_${feature}_enabled`]
      );

      return result.rows.length > 0 && result.rows[0].setting_value === 'true';
    } catch (err) {
      console.error(`Error checking ${feature} status:`, err);
      return false;
    }
  }
}

module.exports = new GamificationService();
