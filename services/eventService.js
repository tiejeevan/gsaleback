// services/eventService.js
const pool = require('../db');
const gamificationService = require('./gamificationService');

class EventService {
  // Get active seasonal events
  async getActiveEvents() {
    try {
      const enabled = await gamificationService.isFeatureEnabled('seasonal_events');
      if (!enabled) return [];

      const result = await pool.query(
        `SELECT * FROM seasonal_events
         WHERE is_active = true
           AND start_date <= CURRENT_TIMESTAMP
           AND end_date >= CURRENT_TIMESTAMP
         ORDER BY xp_multiplier DESC`
      );

      return result.rows;
    } catch (err) {
      console.error('Error fetching active events:', err);
      return [];
    }
  }

  // Get all events (including past and future)
  async getAllEvents() {
    try {
      const result = await pool.query(
        `SELECT * FROM seasonal_events
         ORDER BY start_date DESC`
      );

      return result.rows;
    } catch (err) {
      console.error('Error fetching all events:', err);
      throw err;
    }
  }

  // Create new event
  async createEvent(eventData) {
    try {
      const { name, description, startDate, endDate, xpMultiplier, badgeRewards, eventRules } = eventData;

      const result = await pool.query(
        `INSERT INTO seasonal_events (
          name, description, start_date, end_date, 
          xp_multiplier, badge_rewards, event_rules, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, true)
        RETURNING *`,
        [
          name,
          description,
          startDate,
          endDate,
          xpMultiplier || 1.0,
          JSON.stringify(badgeRewards || []),
          JSON.stringify(eventRules || {})
        ]
      );

      return result.rows[0];
    } catch (err) {
      console.error('Error creating event:', err);
      throw err;
    }
  }

  // Update event
  async updateEvent(eventId, updates) {
    try {
      const { name, description, startDate, endDate, xpMultiplier, badgeRewards, eventRules, isActive } = updates;

      const setClauses = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        setClauses.push(`name = $${paramCount++}`);
        values.push(name);
      }
      if (description !== undefined) {
        setClauses.push(`description = $${paramCount++}`);
        values.push(description);
      }
      if (startDate !== undefined) {
        setClauses.push(`start_date = $${paramCount++}`);
        values.push(startDate);
      }
      if (endDate !== undefined) {
        setClauses.push(`end_date = $${paramCount++}`);
        values.push(endDate);
      }
      if (xpMultiplier !== undefined) {
        setClauses.push(`xp_multiplier = $${paramCount++}`);
        values.push(xpMultiplier);
      }
      if (badgeRewards !== undefined) {
        setClauses.push(`badge_rewards = $${paramCount++}`);
        values.push(JSON.stringify(badgeRewards));
      }
      if (eventRules !== undefined) {
        setClauses.push(`event_rules = $${paramCount++}`);
        values.push(JSON.stringify(eventRules));
      }
      if (isActive !== undefined) {
        setClauses.push(`is_active = $${paramCount++}`);
        values.push(isActive);
      }

      setClauses.push('updated_at = CURRENT_TIMESTAMP');
      values.push(eventId);

      const result = await pool.query(
        `UPDATE seasonal_events
         SET ${setClauses.join(', ')}
         WHERE id = $${paramCount}
         RETURNING *`,
        values
      );

      return result.rows[0];
    } catch (err) {
      console.error('Error updating event:', err);
      throw err;
    }
  }

  // Delete event
  async deleteEvent(eventId) {
    try {
      await pool.query(
        `DELETE FROM seasonal_events WHERE id = $1`,
        [eventId]
      );

      return { success: true };
    } catch (err) {
      console.error('Error deleting event:', err);
      throw err;
    }
  }

  // Check if event is currently active
  async isEventActive(eventId) {
    try {
      const result = await pool.query(
        `SELECT is_active FROM seasonal_events
         WHERE id = $1
           AND start_date <= CURRENT_TIMESTAMP
           AND end_date >= CURRENT_TIMESTAMP`,
        [eventId]
      );

      return result.rows.length > 0 && result.rows[0].is_active;
    } catch (err) {
      console.error('Error checking event status:', err);
      return false;
    }
  }
}

module.exports = new EventService();
