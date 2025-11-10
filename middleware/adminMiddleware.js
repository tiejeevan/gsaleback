const pool = require('../db');

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
    try {
        // req.user should be set by authMiddleware
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Check if user has admin role
        const result = await pool.query(
            'SELECT role FROM users WHERE id = $1 AND is_deleted = FALSE',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (result.rows[0].role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }

        // User is admin, proceed
        next();

    } catch (err) {
        console.error('Admin middleware error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

module.exports = isAdmin;
