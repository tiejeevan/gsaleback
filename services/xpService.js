// services/xpService.js
const pool = require('../db');
const gamificationService = require('./gamificationService');

class XPService {
  // Award XP to user for an action
  async awardXP(userId, actionType, entityId = null, metadata = {}, io = null) {
    try {
      // Check if XP system is enabled
      const enabled = await gamificationService.isFeatureEnabled('xp');
      if (!enabled) return null;

      // Get XP rule for this action
      const ruleResult = await pool.query(
        `SELECT * FROM xp_rules WHERE action_type = $1 AND is_active = true`,
        [actionType]
      );

      if (ruleResult.rows.length === 0) {
        console.log(`No XP rule found for action: ${actionType}`);
        return null;
      }

      const rule = ruleResult.rows[0];

      // Check daily limit
      if (rule.daily_limit > 0) {
        const limitReached = await this.checkDailyLimit(userId, actionType, rule.daily_limit);
        if (limitReached) {
          console.log(`Daily limit reached for ${actionType}`);
          return null;
        }
      }

      // Calculate XP amount (apply multipliers)
      let xpAmount = rule.xp_amount;
      const multiplier = await this.getActiveMultiplier();
      xpAmount = Math.floor(xpAmount * multiplier);

      // Initialize user if needed
      await gamificationService.initializeUser(userId);

      // Award XP
      const result = await pool.query(
        `INSERT INTO xp_transactions (
          user_id, action_type, xp_amount, entity_type, entity_id, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [userId, actionType, xpAmount, rule.entity_type, entityId, JSON.stringify(metadata)]
      );

      // Update user total XP
      const updateResult = await pool.query(
        `UPDATE user_gamification 
         SET total_xp = total_xp + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2
         RETURNING total_xp, current_level`,
        [xpAmount, userId]
      );

      const { total_xp, current_level } = updateResult.rows[0];

      // Check for level up
      const newLevel = this.calculateLevel(total_xp);
      if (newLevel > current_level) {
        await this.handleLevelUp(userId, current_level, newLevel, io);
      }

      // Log event
      await pool.query(
        `INSERT INTO gamification_events_log (user_id, event_type, event_data)
         VALUES ($1, 'xp_earned', $2)`,
        [userId, JSON.stringify({ actionType, xpAmount, entityId })]
      );

      // Emit real-time XP notification via Socket.IO
      if (io) {
        const roomName = `user_${userId}`;
        const eventData = {
          xpAmount,
          actionType,
          totalXP: total_xp,
          currentLevel: newLevel
        };
        console.log(`📡 Emitting 'xp:earned' to room '${roomName}' with data:`, eventData);
        io.to(roomName).emit('xp:earned', eventData);
        console.log(`✅ XP notification emitted successfully`);
      } else {
        console.log('⚠️ Socket.IO instance not available, cannot emit XP notification');
      }

      return {
        xp_earned: xpAmount,
        total_xp,
        current_level: newLevel,
        leveled_up: newLevel > current_level
      };
    } catch (err) {
      console.error('Error awarding XP:', err);
      return null;
    }
  }

  // Calculate level from total XP
  calculateLevel(totalXP) {
    // Formula: level = floor(sqrt(totalXP / 100)) + 1
    // Level 1: 0 XP
    // Level 2: 100 XP
    // Level 3: 400 XP
    // Level 4: 900 XP
    // Level 5: 1600 XP
    return Math.floor(Math.sqrt(totalXP / 100)) + 1;
  }

  // Get XP needed for next level
  getXPToNextLevel(currentLevel) {
    const nextLevel = currentLevel + 1;
    const xpForNextLevel = Math.pow(nextLevel - 1, 2) * 100;
    return xpForNextLevel;
  }

  // Check if daily limit reached
  async checkDailyLimit(userId, actionType, limit) {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as count
         FROM xp_transactions
         WHERE user_id = $1 
           AND action_type = $2
           AND created_at >= CURRENT_DATE`,
        [userId, actionType]
      );

      return parseInt(result.rows[0].count) >= limit;
    } catch (err) {
      console.error('Error checking daily limit:', err);
      return false;
    }
  }

  // Get active XP multiplier from events
  async getActiveMultiplier() {
    try {
      const result = await pool.query(
        `SELECT xp_multiplier FROM seasonal_events
         WHERE is_active = true
           AND start_date <= CURRENT_TIMESTAMP
           AND end_date >= CURRENT_TIMESTAMP
         ORDER BY xp_multiplier DESC
         LIMIT 1`
      );

      if (result.rows.length > 0) {
        return parseFloat(result.rows[0].xp_multiplier);
      }

      // Check global multiplier setting
      const settingResult = await pool.query(
        `SELECT setting_value FROM system_settings 
         WHERE setting_key = 'gamification_xp_multiplier'`
      );

      return settingResult.rows.length > 0 
        ? parseFloat(settingResult.rows[0].setting_value) 
        : 1.0;
    } catch (err) {
      console.error('Error getting multiplier:', err);
      return 1.0;
    }
  }

  // Handle level up
  async handleLevelUp(userId, oldLevel, newLevel, io = null) {
    try {
      // Update level
      await pool.query(
        `UPDATE user_gamification 
         SET current_level = $1
         WHERE user_id = $2`,
        [newLevel, userId]
      );

      // Log level up event
      await pool.query(
        `INSERT INTO gamification_events_log (user_id, event_type, event_data)
         VALUES ($1, 'level_up', $2)`,
        [userId, JSON.stringify({ oldLevel, newLevel })]
      );

      console.log(`🎉 User ${userId} leveled up: ${oldLevel} → ${newLevel}`);

      // Emit real-time level up notification via Socket.IO
      if (io) {
        io.to(`user_${userId}`).emit('level:up', {
          oldLevel,
          newLevel
        });
        console.log(`📡 Emitted level up notification to user_${userId}: Level ${newLevel}`);
      }

      // Check for level-based badges
      const badgeService = require('./badgeService');
      await badgeService.checkAndAwardBadges(userId, io);

      return { oldLevel, newLevel };
    } catch (err) {
      console.error('Error handling level up:', err);
      throw err;
    }
  }

  // Get user XP history
  async getUserXPHistory(userId, limit = 50) {
    try {
      const result = await pool.query(
        `SELECT * FROM xp_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
      );

      return result.rows;
    } catch (err) {
      console.error('Error fetching XP history:', err);
      throw err;
    }
  }

  // Get XP breakdown by action type
  async getXPBreakdown(userId) {
    try {
      const result = await pool.query(
        `SELECT action_type, 
                SUM(xp_amount) as total_xp,
                COUNT(*) as action_count
         FROM xp_transactions
         WHERE user_id = $1
         GROUP BY action_type
         ORDER BY total_xp DESC`,
        [userId]
      );

      return result.rows;
    } catch (err) {
      console.error('Error fetching XP breakdown:', err);
      throw err;
    }
  }
}

module.exports = new XPService();
