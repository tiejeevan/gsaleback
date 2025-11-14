// services/badgeService.js
const pool = require('../db');
const gamificationService = require('./gamificationService');

class BadgeService {
  // Check and award badges to user
  async checkAndAwardBadges(userId, io = null) {
    try {
      const enabled = await gamificationService.isFeatureEnabled('badges');
      if (!enabled) return [];

      // Get all active badges
      const badgesResult = await pool.query(
        `SELECT * FROM badges WHERE is_active = true`
      );

      const newBadges = [];

      for (const badge of badgesResult.rows) {
        // Check if user already has this badge
        const hasResult = await pool.query(
          `SELECT id FROM user_badges WHERE user_id = $1 AND badge_id = $2`,
          [userId, badge.id]
        );

        if (hasResult.rows.length > 0) continue;

        // Check if user meets criteria
        const meetsRequirements = await this.checkBadgeCriteria(userId, badge);
        
        if (meetsRequirements) {
          await this.awardBadge(userId, badge.id, io);
          newBadges.push(badge);
        }
      }

      return newBadges;
    } catch (err) {
      console.error('Error checking badges:', err);
      return [];
    }
  }

  // Check if user meets badge criteria
  async checkBadgeCriteria(userId, badge) {
    try {
      const criteria = badge.criteria;

      // Level-based badges
      if (criteria.min_level) {
        const levelResult = await pool.query(
          `SELECT current_level FROM user_gamification WHERE user_id = $1`,
          [userId]
        );
        if (levelResult.rows.length === 0 || levelResult.rows[0].current_level < criteria.min_level) {
          return false;
        }
      }

      // Post count badges
      if (criteria.min_posts) {
        const postResult = await pool.query(
          `SELECT COUNT(*) as count FROM posts WHERE user_id = $1 AND is_deleted = false`,
          [userId]
        );
        if (parseInt(postResult.rows[0].count) < criteria.min_posts) {
          return false;
        }
      }

      // Comment count badges
      if (criteria.min_comments) {
        const commentResult = await pool.query(
          `SELECT COUNT(*) as count FROM comments WHERE user_id = $1 AND is_deleted = false`,
          [userId]
        );
        if (parseInt(commentResult.rows[0].count) < criteria.min_comments) {
          return false;
        }
      }

      // Likes received badges
      if (criteria.min_likes_received) {
        const likesResult = await pool.query(
          `SELECT COUNT(*) as count FROM likes l
           JOIN posts p ON l.target_id = p.id
           WHERE l.target_type = 'post' AND p.user_id = $1`,
          [userId]
        );
        if (parseInt(likesResult.rows[0].count) < criteria.min_likes_received) {
          return false;
        }
      }

      // Sales count badges
      if (criteria.min_sales) {
        const salesResult = await pool.query(
          `SELECT COUNT(*) as count FROM orders 
           WHERE seller_id = $1 AND status = 'delivered'`,
          [userId]
        );
        if (parseInt(salesResult.rows[0].count) < criteria.min_sales) {
          return false;
        }
      }

      // Positive feedback badges
      if (criteria.min_positive_feedback) {
        const feedbackResult = await pool.query(
          `SELECT COUNT(*) as count FROM reputation_scores 
           WHERE user_id = $1 AND positive_feedback_count >= $2`,
          [userId, criteria.min_positive_feedback]
        );
        if (parseInt(feedbackResult.rows[0].count) < 1) {
          return false;
        }
      }

      // Streak badges
      if (criteria.min_streak_days) {
        const streakResult = await pool.query(
          `SELECT current_streak FROM user_gamification WHERE user_id = $1`,
          [userId]
        );
        if (streakResult.rows.length === 0 || streakResult.rows[0].current_streak < criteria.min_streak_days) {
          return false;
        }
      }

      // Likes given badges
      if (criteria.min_likes_given) {
        const likesGivenResult = await pool.query(
          `SELECT COUNT(*) as count FROM likes WHERE user_id = $1`,
          [userId]
        );
        if (parseInt(likesGivenResult.rows[0].count) < criteria.min_likes_given) {
          return false;
        }
      }

      return true;
    } catch (err) {
      console.error('Error checking badge criteria:', err);
      return false;
    }
  }

  // Award badge to user
  async awardBadge(userId, badgeId, io = null) {
    try {
      // Check if badge already exists (double-check to prevent duplicates)
      const existingBadge = await pool.query(
        `SELECT id FROM user_badges WHERE user_id = $1 AND badge_id = $2`,
        [userId, badgeId]
      );

      if (existingBadge.rows.length > 0) {
        console.log(`⚠️ Badge ${badgeId} already awarded to user ${userId}, skipping`);
        return null;
      }

      const result = await pool.query(
        `INSERT INTO user_badges (user_id, badge_id, earned_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         RETURNING *`,
        [userId, badgeId]
      );

      // Log event
      await pool.query(
        `INSERT INTO gamification_events_log (user_id, event_type, event_data)
         VALUES ($1, 'badge_earned', $2)`,
        [userId, JSON.stringify({ badgeId })]
      );

      console.log(`🏆 User ${userId} earned NEW badge ${badgeId}`);

      // Get badge details for notification
      const badgeResult = await pool.query(
        `SELECT * FROM badges WHERE id = $1`,
        [badgeId]
      );

      // Emit real-time badge notification via Socket.IO ONLY for new badges
      if (io && badgeResult.rows.length > 0) {
        const badge = badgeResult.rows[0];
        io.to(`user_${userId}`).emit('badge:earned', {
          badgeId,
          badgeName: badge.name,
          badgeIcon: badge.icon_url,
          badgeRarity: badge.rarity
        });
        console.log(`📡 Emitted badge notification to user_${userId}: ${badge.name}`);
      }

      return result.rows[0];
    } catch (err) {
      console.error('Error awarding badge:', err);
      throw err;
    }
  }

  // Get user's badges
  async getUserBadges(userId) {
    try {
      const result = await pool.query(
        `SELECT b.*, ub.earned_at, ub.progress_data
         FROM user_badges ub
         JOIN badges b ON ub.badge_id = b.id
         WHERE ub.user_id = $1
         ORDER BY ub.earned_at DESC`,
        [userId]
      );

      return result.rows;
    } catch (err) {
      console.error('Error fetching user badges:', err);
      throw err;
    }
  }

  // Get all available badges
  async getAllBadges() {
    try {
      const result = await pool.query(
        `SELECT * FROM badges WHERE is_active = true ORDER BY rarity, name`
      );

      return result.rows;
    } catch (err) {
      console.error('Error fetching badges:', err);
      throw err;
    }
  }

  // Get badge progress for user
  async getBadgeProgress(userId, badgeId) {
    try {
      const badgeResult = await pool.query(
        `SELECT * FROM badges WHERE id = $1`,
        [badgeId]
      );

      if (badgeResult.rows.length === 0) return null;

      const badge = badgeResult.rows[0];
      const criteria = badge.criteria;
      const progress = {};

      // Calculate progress for each criterion
      if (criteria.min_level) {
        const levelResult = await pool.query(
          `SELECT current_level FROM user_gamification WHERE user_id = $1`,
          [userId]
        );
        progress.level = {
          current: levelResult.rows[0]?.current_level || 1,
          required: criteria.min_level,
          percentage: Math.min(100, ((levelResult.rows[0]?.current_level || 1) / criteria.min_level) * 100)
        };
      }

      if (criteria.min_posts) {
        const postResult = await pool.query(
          `SELECT COUNT(*) as count FROM posts WHERE user_id = $1 AND is_deleted = false`,
          [userId]
        );
        const current = parseInt(postResult.rows[0].count);
        progress.posts = {
          current,
          required: criteria.min_posts,
          percentage: Math.min(100, (current / criteria.min_posts) * 100)
        };
      }

      return { badge, progress };
    } catch (err) {
      console.error('Error fetching badge progress:', err);
      throw err;
    }
  }
}

module.exports = new BadgeService();
