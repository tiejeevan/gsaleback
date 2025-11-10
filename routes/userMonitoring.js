const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// All routes require admin access
router.use(authMiddleware);
router.use(adminMiddleware);

// Search users
router.get('/search', async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query || query.length < 2) {
            return res.json({ users: [] });
        }

        const result = await pool.query(`
            SELECT 
                id, username, email, first_name, last_name, 
                role, status, profile_image, created_at, last_login_at
            FROM users 
            WHERE (username ILIKE $1 OR email ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1)
            AND (is_deleted = FALSE OR is_deleted IS NULL)
            ORDER BY username
            LIMIT 20
        `, [`%${query}%`]);

        res.json({ users: result.rows });
    } catch (err) {
        console.error('Error searching users:', err);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

// Get user overview stats
router.get('/:userId/overview', async (req, res) => {
    try {
        const { userId } = req.params;

        // User basic info
        const userResult = await pool.query(`
            SELECT 
                id, username, email, first_name, last_name, display_name,
                role, status, bio, location, website, phone,
                profile_image, cover_image, is_verified,
                follower_count, following_count,
                created_at, updated_at, last_login_at, last_login_ip, last_logout_at
            FROM users 
            WHERE id = $1
        `, [userId]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        // Posts count
        const postsCount = await pool.query(
            'SELECT COUNT(*) as count FROM posts WHERE user_id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)',
            [userId]
        );

        // Comments count
        const commentsCount = await pool.query(
            'SELECT COUNT(*) as count FROM comments WHERE user_id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)',
            [userId]
        );

        // Likes given
        const likesGiven = await pool.query(
            'SELECT COUNT(*) as count FROM likes WHERE user_id = $1',
            [userId]
        );

        // Total logins
        const loginStats = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE activity_type = 'signin' AND success = TRUE) as total_logins,
                COUNT(*) FILTER (WHERE activity_type = 'signout') as total_logouts,
                COUNT(*) FILTER (WHERE activity_type = 'failed_login') as failed_logins,
                MAX(created_at) FILTER (WHERE activity_type = 'signin' AND success = TRUE) as last_login,
                MIN(created_at) FILTER (WHERE activity_type = 'signin' AND success = TRUE) as first_login
            FROM user_logs 
            WHERE user_id = $1
        `, [userId]);

        // Chat participation
        const chatStats = await pool.query(`
            SELECT COUNT(DISTINCT chat_id) as chat_count
            FROM chat_participants 
            WHERE user_id = $1 AND left_at IS NULL
        `, [userId]);

        // Messages sent
        const messagesCount = await pool.query(
            'SELECT COUNT(*) as count FROM messages WHERE sender_id = $1 AND is_deleted = FALSE',
            [userId]
        );

        res.json({
            user,
            stats: {
                posts: parseInt(postsCount.rows[0].count),
                comments: parseInt(commentsCount.rows[0].count),
                likesGiven: parseInt(likesGiven.rows[0].count),
                totalLogins: parseInt(loginStats.rows[0].total_logins || 0),
                totalLogouts: parseInt(loginStats.rows[0].total_logouts || 0),
                failedLogins: parseInt(loginStats.rows[0].failed_logins || 0),
                lastLogin: loginStats.rows[0].last_login,
                firstLogin: loginStats.rows[0].first_login,
                chats: parseInt(chatStats.rows[0].chat_count || 0),
                messagesSent: parseInt(messagesCount.rows[0].count)
            }
        });
    } catch (err) {
        console.error('Error fetching user overview:', err);
        res.status(500).json({ error: 'Failed to fetch user overview' });
    }
});

// Get user activity logs
router.get('/:userId/activity-logs', async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const result = await pool.query(`
            SELECT 
                id, activity_type, success, ip_address, user_agent,
                device_info, error_message, session_id, duration, created_at
            FROM user_logs 
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        `, [userId, limit]);

        res.json({ logs: result.rows });
    } catch (err) {
        console.error('Error fetching activity logs:', err);
        res.status(500).json({ error: 'Failed to fetch activity logs' });
    }
});

// Get user posts
router.get('/:userId/posts', async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 20;

        const result = await pool.query(`
            SELECT 
                p.id, p.content, p.image_url, p.created_at, p.updated_at,
                p.is_deleted, p.deleted_at,
                (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
                (SELECT COUNT(*) FROM comments WHERE post_id = p.id AND (is_deleted = FALSE OR is_deleted IS NULL)) as comments_count
            FROM posts p
            WHERE p.user_id = $1
            ORDER BY p.created_at DESC
            LIMIT $2
        `, [userId, limit]);

        res.json({ posts: result.rows });
    } catch (err) {
        console.error('Error fetching user posts:', err);
        res.status(500).json({ error: 'Failed to fetch user posts' });
    }
});

// Get user chats
router.get('/:userId/chats', async (req, res) => {
    try {
        const { userId } = req.params;

        const result = await pool.query(`
            SELECT 
                c.id, c.type, c.title, c.avatar_url, c.last_message_at,
                cp.joined_at, cp.last_read_at, cp.muted, cp.pinned,
                (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) as message_count
            FROM chats c
            JOIN chat_participants cp ON c.id = cp.chat_id
            WHERE cp.user_id = $1 AND cp.left_at IS NULL
            ORDER BY c.last_message_at DESC NULLS LAST
            LIMIT 20
        `, [userId]);

        res.json({ chats: result.rows });
    } catch (err) {
        console.error('Error fetching user chats:', err);
        res.status(500).json({ error: 'Failed to fetch user chats' });
    }
});

// Get user followers/following
router.get('/:userId/social', async (req, res) => {
    try {
        const { userId } = req.params;

        // Followers
        const followers = await pool.query(`
            SELECT 
                u.id, u.username, u.display_name, u.profile_image,
                uf.created_at as followed_at
            FROM user_follows uf
            JOIN users u ON uf.follower_id = u.id
            WHERE uf.following_id = $1
            ORDER BY uf.created_at DESC
            LIMIT 50
        `, [userId]);

        // Following
        const following = await pool.query(`
            SELECT 
                u.id, u.username, u.display_name, u.profile_image,
                uf.created_at as followed_at
            FROM user_follows uf
            JOIN users u ON uf.following_id = u.id
            WHERE uf.follower_id = $1
            ORDER BY uf.created_at DESC
            LIMIT 50
        `, [userId]);

        res.json({
            followers: followers.rows,
            following: following.rows
        });
    } catch (err) {
        console.error('Error fetching user social:', err);
        res.status(500).json({ error: 'Failed to fetch user social data' });
    }
});

// Get user messages from a specific chat
router.get('/:userId/chats/:chatId/messages', async (req, res) => {
    try {
        const { userId, chatId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        // Verify user is participant
        const participantCheck = await pool.query(
            'SELECT id FROM chat_participants WHERE user_id = $1 AND chat_id = $2',
            [userId, chatId]
        );

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({ error: 'User is not a participant in this chat' });
        }

        const result = await pool.query(`
            SELECT 
                m.id, m.content, m.type, m.created_at, m.is_edited, m.is_deleted,
                u.username, u.display_name, u.profile_image
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.id
            WHERE m.chat_id = $1
            ORDER BY m.created_at DESC
            LIMIT $2
        `, [chatId, limit]);

        res.json({ messages: result.rows });
    } catch (err) {
        console.error('Error fetching chat messages:', err);
        res.status(500).json({ error: 'Failed to fetch chat messages' });
    }
});

module.exports = router;
