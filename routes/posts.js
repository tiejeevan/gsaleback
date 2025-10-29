const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../db');

// ================= Middleware: Verify Token =================
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id: userId }
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// ================= Helper: Log Post Activity =================
const logPostActivity = async ({ userId, postId, type, success, req }) => {
    try {
        await pool.query(
            `INSERT INTO post_logs (user_id, post_id, activity_type, ip_address, user_agent, success)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, postId, type, req.ip, req.get('User-Agent'), success]
        );
    } catch (err) {
        console.error('Error logging post activity:', err.message);
    }
};

// ====================================================================
// 🟢 CORE ENDPOINTS (Create, Read, Update, Delete)
// ====================================================================

// ✅ Create a new post
router.post('/', verifyToken, async (req, res) => {
    const { content, image_url, visibility = 'public' } = req.body;

    if (!content || content.trim() === '') {
        return res.status(400).json({ error: 'Post content cannot be empty' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO posts (user_id, content, image_url, visibility)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [req.user.id, content, image_url || null, visibility]
        );

        await logPostActivity({ userId: req.user.id, postId: result.rows[0].id, type: 'create', success: true, req });
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

// ✅ Get all visible posts (feed)
router.get('/', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, u.username, u.first_name, u.last_name
             FROM posts p
             JOIN users u ON p.user_id = u.id
             WHERE p.is_deleted = false
             ORDER BY p.created_at DESC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
});

// ✅ Get a single post by ID
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, u.username, u.first_name, u.last_name
             FROM posts p
             JOIN users u ON p.user_id = u.id
             WHERE p.id = $1 AND p.is_deleted = false`,
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to fetch post' });
    }
});

// ✅ Update a post
router.put('/:id', verifyToken, async (req, res) => {
    const { content, image_url, visibility } = req.body;

    try {
        const result = await pool.query(
            `UPDATE posts
             SET content = COALESCE($1, content),
                 image_url = COALESCE($2, image_url),
                 visibility = COALESCE($3, visibility),
                 is_edited = true,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4 AND user_id = $5
             RETURNING *`,
            [content, image_url, visibility, req.params.id, req.user.id]
        );

        if (result.rows.length === 0)
            return res.status(403).json({ error: 'Unauthorized or post not found' });

        await logPostActivity({ userId: req.user.id, postId: req.params.id, type: 'edit', success: true, req });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to update post' });
    }
});

// ✅ Soft delete a post
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE posts SET is_deleted = true WHERE id = $1 AND user_id = $2 RETURNING *`,
            [req.params.id, req.user.id]
        );

        if (result.rows.length === 0)
            return res.status(403).json({ error: 'Unauthorized or post not found' });

        await logPostActivity({ userId: req.user.id, postId: req.params.id, type: 'delete', success: true, req });
        res.json({ msg: 'Post deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});

// ====================================================================
// 🔵 OPTIONAL ENDPOINTS (Future-Proof Extensions)
// ====================================================================

// ✅ Get all posts by a specific user
router.get('/user/:userId', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM posts WHERE user_id = $1 AND is_deleted = false ORDER BY created_at DESC`,
            [req.params.userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to fetch user posts' });
    }
});

// ✅ Like a post (increments like_count)
router.post('/:id/like', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE posts
             SET like_count = like_count + 1
             WHERE id = $1 AND is_deleted = false
             RETURNING *`,
            [req.params.id]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Post not found' });

        await logPostActivity({ userId: req.user.id, postId: req.params.id, type: 'like', success: true, req });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to like post' });
    }
});

// ✅ Unlike a post (decrements like_count safely)
router.post('/:id/unlike', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE posts
             SET like_count = GREATEST(like_count - 1, 0)
             WHERE id = $1 AND is_deleted = false
             RETURNING *`,
            [req.params.id]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Post not found' });

        await logPostActivity({ userId: req.user.id, postId: req.params.id, type: 'unlike', success: true, req });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to unlike post' });
    }
});

module.exports = router;
