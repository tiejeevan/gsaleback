// routes/adminGamification.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const pool = require('../db');
const gamificationService = require('../services/gamificationService');
const xpService = require('../services/xpService');
const badgeService = require('../services/badgeService');
const leaderboardService = require('../services/leaderboardService');
const eventService = require('../services/eventService');

// All routes require admin authentication
router.use(authMiddleware);
router.use(adminMiddleware);

// Get all gamification settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await gamificationService.getSettings();
    res.json(settings);
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update gamification setting
router.put('/settings/:key', async (req, res) => {
  try {
    const key = `gamification_${req.params.key}`;
    const { value } = req.body;

    const result = await pool.query(
      `UPDATE system_settings 
       SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
       WHERE setting_key = $2
       RETURNING *`,
      [value, key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    // Log admin action
    await pool.query(
      `INSERT INTO admin_gamification_logs (admin_id, action_type, action_data)
       VALUES ($1, 'setting_update', $2)`,
      [req.user.id, JSON.stringify({ key, value })]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating setting:', err);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Get all XP rules
router.get('/xp-rules', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM xp_rules ORDER BY action_type`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching XP rules:', err);
    res.status(500).json({ error: 'Failed to fetch XP rules' });
  }
});

// Update XP rule
router.put('/xp-rules/:id', async (req, res) => {
  try {
    const { xp_amount, daily_limit, is_active } = req.body;
    
    const result = await pool.query(
      `UPDATE xp_rules 
       SET xp_amount = COALESCE($1, xp_amount),
           daily_limit = COALESCE($2, daily_limit),
           is_active = COALESCE($3, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [xp_amount, daily_limit, is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'XP rule not found' });
    }

    // Log admin action
    await pool.query(
      `INSERT INTO admin_gamification_logs (admin_id, action_type, action_data)
       VALUES ($1, 'xp_rule_update', $2)`,
      [req.user.id, JSON.stringify({ ruleId: req.params.id, updates: req.body })]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating XP rule:', err);
    res.status(500).json({ error: 'Failed to update XP rule' });
  }
});

// Get all badges
router.get('/badges', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM badges ORDER BY rarity, name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching badges:', err);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

// Create badge
router.post('/badges', async (req, res) => {
  try {
    const { name, description, icon, rarity, criteria } = req.body;

    const result = await pool.query(
      `INSERT INTO badges (name, description, icon, rarity, criteria, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [name, description, icon, rarity, JSON.stringify(criteria)]
    );

    // Log admin action
    await pool.query(
      `INSERT INTO admin_gamification_logs (admin_id, action_type, action_data)
       VALUES ($1, 'badge_create', $2)`,
      [req.user.id, JSON.stringify({ badgeId: result.rows[0].id, name })]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating badge:', err);
    res.status(500).json({ error: 'Failed to create badge' });
  }
});

// Update badge
router.put('/badges/:id', async (req, res) => {
  try {
    const { name, description, icon, rarity, criteria, is_active } = req.body;

    const result = await pool.query(
      `UPDATE badges 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           icon = COALESCE($3, icon),
           rarity = COALESCE($4, rarity),
           criteria = COALESCE($5, criteria),
           is_active = COALESCE($6, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [name, description, icon, rarity, criteria ? JSON.stringify(criteria) : null, is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Badge not found' });
    }

    // Log admin action
    await pool.query(
      `INSERT INTO admin_gamification_logs (admin_id, action_type, action_data)
       VALUES ($1, 'badge_update', $2)`,
      [req.user.id, JSON.stringify({ badgeId: req.params.id, updates: req.body })]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating badge:', err);
    res.status(500).json({ error: 'Failed to update badge' });
  }
});

// Delete badge
router.delete('/badges/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM badges WHERE id = $1`, [req.params.id]);

    // Log admin action
    await pool.query(
      `INSERT INTO admin_gamification_logs (admin_id, action_type, action_data)
       VALUES ($1, 'badge_delete', $2)`,
      [req.user.id, JSON.stringify({ badgeId: req.params.id })]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting badge:', err);
    res.status(500).json({ error: 'Failed to delete badge' });
  }
});

// Get all events
router.get('/events', async (req, res) => {
  try {
    const events = await eventService.getAllEvents();
    res.json(events);
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Create event
router.post('/events', async (req, res) => {
  try {
    const event = await eventService.createEvent(req.body);

    // Log admin action
    await pool.query(
      `INSERT INTO admin_gamification_logs (admin_id, action_type, action_data)
       VALUES ($1, 'event_create', $2)`,
      [req.user.id, JSON.stringify({ eventId: event.id, name: event.name })]
    );

    res.status(201).json(event);
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event
router.put('/events/:id', async (req, res) => {
  try {
    const event = await eventService.updateEvent(req.params.id, req.body);

    // Log admin action
    await pool.query(
      `INSERT INTO admin_gamification_logs (admin_id, action_type, action_data)
       VALUES ($1, 'event_update', $2)`,
      [req.user.id, JSON.stringify({ eventId: req.params.id, updates: req.body })]
    );

    res.json(event);
  } catch (err) {
    console.error('Error updating event:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event
router.delete('/events/:id', async (req, res) => {
  try {
    await eventService.deleteEvent(req.params.id);

    // Log admin action
    await pool.query(
      `INSERT INTO admin_gamification_logs (admin_id, action_type, action_data)
       VALUES ($1, 'event_delete', $2)`,
      [req.user.id, JSON.stringify({ eventId: req.params.id })]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Manually adjust user XP
router.post('/manual-xp', async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;

    const result = await pool.query(
      `INSERT INTO xp_transactions (user_id, action_type, xp_amount, metadata)
       VALUES ($1, 'admin_adjustment', $2, $3)
       RETURNING *`,
      [userId, amount, JSON.stringify({ reason, adminId: req.user.id })]
    );

    // Update user total XP
    await pool.query(
      `UPDATE user_gamification 
       SET total_xp = total_xp + $1
       WHERE user_id = $2`,
      [amount, userId]
    );

    // Log admin action
    await pool.query(
      `INSERT INTO admin_gamification_logs (admin_id, action_type, action_data)
       VALUES ($1, 'manual_xp_adjustment', $2)`,
      [req.user.id, JSON.stringify({ userId, amount, reason })]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error adjusting XP:', err);
    res.status(500).json({ error: 'Failed to adjust XP' });
  }
});

// Force update leaderboards
router.post('/leaderboards/update', async (req, res) => {
  try {
    await leaderboardService.updateAllLeaderboards();

    // Log admin action
    await pool.query(
      `INSERT INTO admin_gamification_logs (admin_id, action_type, action_data)
       VALUES ($1, 'leaderboard_update', $2)`,
      [req.user.id, JSON.stringify({ timestamp: new Date() })]
    );

    res.json({ success: true, message: 'Leaderboards updated successfully' });
  } catch (err) {
    console.error('Error updating leaderboards:', err);
    res.status(500).json({ error: 'Failed to update leaderboards' });
  }
});

// Get system statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await gamificationService.getSystemStats();
    res.json(stats);
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get admin logs
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    
    const result = await pool.query(
      `SELECT l.*, u.username
       FROM admin_gamification_logs l
       JOIN users u ON l.admin_id = u.id
       ORDER BY l.created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching logs:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

module.exports = router;
