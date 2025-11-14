// services/leaderboardService.js
const pool = require('../db');
const gamificationService = require('./gamificationService');

class LeaderboardService {
  // Update all leaderboards (called by cron job)
  async updateAllLeaderboards() {
    try {
      const enabled = await gamificationService.isFeatureEnabled('leaderboards');
      if (!enabled) return;

      console.log('🏆 Updating leaderboards...');

      await this.updateTopLevelLeaderboard();
      await this.updateWeeklySellersLeaderboard();
      await this.updateMonthlyCreatorsLeaderboard();
      await this.updateTopHelpersLeaderboard();

      console.log('✅ Leaderboards updated successfully');
    } catch (err) {
      console.error('Error updating leaderboards:', err);
    }
  }

  // Update top level leaderboard
  async updateTopLevelLeaderboard() {
    try {
      // Clear existing
      await pool.query(`DELETE FROM leaderboards WHERE leaderboard_type = 'top_level'`);

      // Get top 100 users by level and XP
      const result = await pool.query(
        `SELECT user_id, current_level as score, total_xp
         FROM user_gamification
         ORDER BY current_level DESC, total_xp DESC
         LIMIT 100`
      );

      // Insert rankings
      for (let i = 0; i < result.rows.length; i++) {
        const user = result.rows[i];
        await pool.query(
          `INSERT INTO leaderboards (user_id, leaderboard_type, rank, score, metadata)
           VALUES ($1, 'top_level', $2, $3, $4)`,
          [user.user_id, i + 1, user.score, JSON.stringify({ total_xp: user.total_xp })]
        );
      }
    } catch (err) {
      console.error('Error updating top level leaderboard:', err);
    }
  }

  // Update weekly sellers leaderboard
  async updateWeeklySellersLeaderboard() {
    try {
      await pool.query(`DELETE FROM leaderboards WHERE leaderboard_type = 'weekly_sellers'`);

      const result = await pool.query(
        `SELECT seller_id as user_id, COUNT(*) as score
         FROM orders
         WHERE status = 'delivered'
           AND created_at >= CURRENT_DATE - INTERVAL '7 days'
         GROUP BY seller_id
         ORDER BY score DESC
         LIMIT 100`
      );

      for (let i = 0; i < result.rows.length; i++) {
        const user = result.rows[i];
        await pool.query(
          `INSERT INTO leaderboards (user_id, leaderboard_type, rank, score)
           VALUES ($1, 'weekly_sellers', $2, $3)`,
          [user.user_id, i + 1, user.score]
        );
      }
    } catch (err) {
      console.error('Error updating weekly sellers leaderboard:', err);
    }
  }

  // Update monthly creators leaderboard
  async updateMonthlyCreatorsLeaderboard() {
    try {
      await pool.query(`DELETE FROM leaderboards WHERE leaderboard_type = 'monthly_creators'`);

      const result = await pool.query(
        `SELECT p.user_id, COUNT(DISTINCT l.id) as score
         FROM posts p
         LEFT JOIN likes l ON l.target_id = p.id AND l.target_type = 'post'
         WHERE p.created_at >= CURRENT_DATE - INTERVAL '30 days'
           AND p.is_deleted = false
         GROUP BY p.user_id
         ORDER BY score DESC
         LIMIT 100`
      );

      for (let i = 0; i < result.rows.length; i++) {
        const user = result.rows[i];
        await pool.query(
          `INSERT INTO leaderboards (user_id, leaderboard_type, rank, score)
           VALUES ($1, 'monthly_creators', $2, $3)`,
          [user.user_id, i + 1, user.score]
        );
      }
    } catch (err) {
      console.error('Error updating monthly creators leaderboard:', err);
    }
  }

  // Update top helpers leaderboard
  async updateTopHelpersLeaderboard() {
    try {
      await pool.query(`DELETE FROM leaderboards WHERE leaderboard_type = 'top_helpers'`);

      const result = await pool.query(
        `SELECT user_id, 
                (SELECT COUNT(*) FROM comments WHERE user_id = ug.user_id AND is_deleted = false) +
                (SELECT COUNT(*) FROM likes WHERE user_id = ug.user_id) as score
         FROM user_gamification ug
         ORDER BY score DESC
         LIMIT 100`
      );

      for (let i = 0; i < result.rows.length; i++) {
        const user = result.rows[i];
        await pool.query(
          `INSERT INTO leaderboards (user_id, leaderboard_type, rank, score)
           VALUES ($1, 'top_helpers', $2, $3)`,
          [user.user_id, i + 1, user.score]
        );
      }
    } catch (err) {
      console.error('Error updating top helpers leaderboard:', err);
    }
  }

  // Get leaderboard
  async getLeaderboard(type, limit = 50) {
    try {
      const result = await pool.query(
        `SELECT l.*, u.username, u.first_name, u.last_name, u.profile_image,
                ug.current_level, ug.total_xp
         FROM leaderboards l
         JOIN users u ON l.user_id = u.id
         LEFT JOIN user_gamification ug ON l.user_id = ug.user_id
         WHERE l.leaderboard_type = $1
         ORDER BY l.rank ASC
         LIMIT $2`,
        [type, limit]
      );

      return result.rows;
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      throw err;
    }
  }

  // Get user's rank in leaderboard
  async getUserRank(userId, type) {
    try {
      const result = await pool.query(
        `SELECT rank, score FROM leaderboards
         WHERE user_id = $1 AND leaderboard_type = $2`,
        [userId, type]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error('Error fetching user rank:', err);
      throw err;
    }
  }

  // Get all leaderboard types
  getLeaderboardTypes() {
    return [
      { type: 'top_level', name: 'Top Level', description: 'Highest level users' },
      { type: 'weekly_sellers', name: 'Weekly Sellers', description: 'Most sales this week' },
      { type: 'monthly_creators', name: 'Monthly Creators', description: 'Most liked posts this month' },
      { type: 'top_helpers', name: 'Top Helpers', description: 'Most helpful community members' }
    ];
  }
}

module.exports = new LeaderboardService();
