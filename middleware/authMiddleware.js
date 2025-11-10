// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const pool = require('../db');

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check user status in database
    const userResult = await pool.query(
      'SELECT id, username, email, role, status, is_deleted FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Check if user is deleted
    if (user.is_deleted) {
      return res.status(403).json({ error: 'Account has been deleted' });
    }

    // Check if user is suspended or deactivated (cannot access platform)
    if (user.status === 'suspended') {
      return res.status(403).json({ 
        error: 'Account suspended',
        message: 'Your account has been suspended. Please contact support.'
      });
    }

    if (user.status === 'deactivated') {
      return res.status(403).json({ 
        error: 'Account deactivated',
        message: 'Your account is deactivated. Please reactivate to continue.'
      });
    }

    // Attach full user info to request
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
};
