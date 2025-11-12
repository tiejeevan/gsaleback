const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminMiddleware');

// Get all system settings (admin only)
router.get('/', auth, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT setting_key, setting_value, description, updated_at FROM system_settings ORDER BY setting_key'
        );
        res.json({ settings: result.rows });
    } catch (err) {
        console.error('Error fetching system settings:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get specific setting (public - for signup page)
router.get('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const result = await pool.query(
            'SELECT setting_key, setting_value FROM system_settings WHERE setting_key = $1',
            [key]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Setting not found' });
        }
        
        res.json({ setting: result.rows[0] });
    } catch (err) {
        console.error('Error fetching setting:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update system setting (admin only)
router.put('/:key', auth, isAdmin, async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        const adminId = req.user.id;

        if (value === undefined || value === null) {
            return res.status(400).json({ error: 'Setting value is required' });
        }

        const result = await pool.query(
            `UPDATE system_settings 
             SET setting_value = $1, updated_by = $2, updated_at = NOW()
             WHERE setting_key = $3
             RETURNING setting_key, setting_value, description, updated_at`,
            [value.toString(), adminId, key]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Setting not found' });
        }

        // Log admin action
        await pool.query(
            `INSERT INTO admin_actions (admin_id, action_type, reason, metadata)
             VALUES ($1, $2, $3, $4)`,
            [
                adminId,
                'update_system_setting',
                `Updated system setting: ${key}`,
                JSON.stringify({ setting_key: key, new_value: value })
            ]
        );

        res.json({ 
            message: 'Setting updated successfully',
            setting: result.rows[0]
        });
    } catch (err) {
        console.error('Error updating setting:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
