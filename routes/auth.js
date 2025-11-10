const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db'); // Postgres connection

// Helper to log user activities
const logActivity = async ({ userId, type, success, req }) => {
    try {
        await pool.query(
            `INSERT INTO user_logs (user_id, activity_type, ip_address, user_agent, success)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, type, req.ip, req.get('User-Agent'), success]
        );
    } catch (err) {
        console.error('Error logging activity:', err.message);
    }
};

// ================= Signup =================
router.post('/signup', async (req, res) => {
    const { first_name, last_name, username, email, password } = req.body;

    try {
        // Check if username exists (must be unique)
        const existingUser = await pool.query(
            "SELECT * FROM users WHERE username = $1", [username]
        );
        if (existingUser.rows.length > 0) {
            await logActivity({ userId: null, type: 'signup', success: false, req });
            return res.status(400).json({ msg: 'Username already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        const newUser = await pool.query(
            `INSERT INTO users (first_name, last_name, username, email, password)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, first_name, last_name, username, email, role`,
            [first_name, last_name, username, email, hashedPassword]
        );

        // Log signup activity
        await logActivity({ userId: newUser.rows[0].id, type: 'signup', success: true, req });

        // Create JWT token
        const token = jwt.sign(
            { id: newUser.rows[0].id },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ token, user: newUser.rows[0] });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ================= Signin =================
router.post('/signin', async (req, res) => {
    const { username, password } = req.body;

    try {
        const userRes = await pool.query(
            "SELECT * FROM users WHERE username = $1", [username]
        );
        const user = userRes.rows[0];

        if (!user) {
            await logActivity({ userId: null, type: 'failed_login', success: false, req });
            return res.status(400).json({ msg: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            await logActivity({ userId: user.id, type: 'failed_login', success: false, req });
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        // JWT token
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1d' });

        // Log successful signin
        await logActivity({ userId: user.id, type: 'signin', success: true, req });

        res.json({
            token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                username: user.username,
                email: user.email,
                role: user.role || 'user'
            }
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ================= Signout =================
router.post('/signout', async (req, res) => {
    try {
        const userId = req.body.userId; // Frontend should send the userId
        if (!userId) return res.status(400).json({ msg: 'User ID required for signout' });

        await logActivity({ userId, type: 'signout', success: true, req });

        res.json({ msg: 'Signout logged successfully' });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
