// services/reputationService.js
const pool = require('../db');
const gamificationService = require('./gamificationService');

class ReputationService {
  // Calculate and update user reputation
  async updateReputation(userId) {
    try {
      const enabled = await gamificationService.isFeatureEnabled('reputation');
      if (!enabled) return null;

      // Get reputation factors
      const factors = await this.getReputationFactors(userId);

      // Calculate reputation score
      const score = this.calculateReputationScore(factors);

      // Determine reputation level
      const level = this.getReputationLevel(score);

      // Update or insert reputation score
      await pool.query(
        `INSERT INTO reputation_scores (
          user_id, reputation_score, reputation_level,
          positive_feedback_count, negative_feedback_count,
          completed_sales_count, response_time_avg,
          reports_against_count, trust_score
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id) 
        DO UPDATE SET
          reputation_score = $2,
          reputation_level = $3,
          positive_feedback_count = $4,
          negative_feedback_count = $5,
          completed_sales_count = $6,
          response_time_avg = $7,
          reports_against_count = $8,
          trust_score = $9,
          updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          score,
          level,
          factors.positiveFeedback,
          factors.negativeFeedback,
          factors.completedSales,
          factors.avgResponseTime,
          factors.reportsAgainst,
          factors.trustScore
        ]
      );

      // Update user_gamification table
      await pool.query(
        `UPDATE user_gamification 
         SET reputation_score = $1, reputation_level = $2
         WHERE user_id = $3`,
        [score, level, userId]
      );

      return { score, level, factors };
    } catch (err) {
      console.error('Error updating reputation:', err);
      throw err;
    }
  }

  // Get reputation factors for user
  async getReputationFactors(userId) {
    try {
      const factors = {
        positiveFeedback: 0,
        negativeFeedback: 0,
        completedSales: 0,
        avgResponseTime: 0,
        reportsAgainst: 0,
        trustScore: 0
      };

      // Positive feedback (from orders/reviews)
      const positiveFeedbackResult = await pool.query(
        `SELECT COUNT(*) as count FROM orders
         WHERE seller_id = $1 AND status = 'delivered'`,
        [userId]
      );
      factors.positiveFeedback = parseInt(positiveFeedbackResult.rows[0].count);

      // Completed sales
      factors.completedSales = factors.positiveFeedback;

      // Response time (from messages)
      const responseTimeResult = await pool.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (m2.created_at - m1.created_at))/60) as avg_minutes
         FROM messages m1
         JOIN messages m2 ON m1.chat_id = m2.chat_id
         WHERE m1.receiver_id = $1 
           AND m2.sender_id = $1
           AND m2.created_at > m1.created_at
           AND m2.created_at - m1.created_at < INTERVAL '1 day'`,
        [userId]
      );
      factors.avgResponseTime = parseFloat(responseTimeResult.rows[0]?.avg_minutes) || 0;

      // Calculate trust score (0-100)
      factors.trustScore = this.calculateTrustScore(factors);

      return factors;
    } catch (err) {
      console.error('Error getting reputation factors:', err);
      return {
        positiveFeedback: 0,
        negativeFeedback: 0,
        completedSales: 0,
        avgResponseTime: 0,
        reportsAgainst: 0,
        trustScore: 0
      };
    }
  }

  // Calculate reputation score
  calculateReputationScore(factors) {
    let score = 0;

    // Positive feedback (4 points each)
    score += factors.positiveFeedback * 4;

    // Completed sales (2 points each)
    score += factors.completedSales * 2;

    // Fast response bonus (up to 30 points)
    if (factors.avgResponseTime > 0) {
      if (factors.avgResponseTime < 5) score += 30;
      else if (factors.avgResponseTime < 15) score += 20;
      else if (factors.avgResponseTime < 60) score += 10;
    }

    // Negative feedback penalty (5 points each)
    score -= factors.negativeFeedback * 5;

    // Reports penalty (10 points each)
    score -= factors.reportsAgainst * 10;

    // Ensure score is not negative
    return Math.max(0, score);
  }

  // Calculate trust score (0-100)
  calculateTrustScore(factors) {
    let trust = 50; // Start at 50

    // Positive feedback increases trust
    trust += Math.min(30, factors.positiveFeedback * 2);

    // Fast response increases trust
    if (factors.avgResponseTime > 0 && factors.avgResponseTime < 30) {
      trust += 10;
    }

    // Negative feedback decreases trust
    trust -= factors.negativeFeedback * 10;

    // Reports decrease trust
    trust -= factors.reportsAgainst * 15;

    return Math.max(0, Math.min(100, trust));
  }

  // Get reputation level from score
  getReputationLevel(score) {
    if (score >= 500) return 'Elite Seller';
    if (score >= 300) return 'Trusted Seller';
    if (score >= 150) return 'Established Seller';
    if (score >= 50) return 'Rising Seller';
    return 'Beginner';
  }

  // Get user reputation
  async getUserReputation(userId) {
    try {
      const result = await pool.query(
        `SELECT * FROM reputation_scores WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        // Calculate if doesn't exist
        return await this.updateReputation(userId);
      }

      return result.rows[0];
    } catch (err) {
      console.error('Error fetching user reputation:', err);
      throw err;
    }
  }
}

module.exports = new ReputationService();
