const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../db');
const multer = require('multer');
const AWS = require('aws-sdk');
require('dotenv').config({ path: '.env' });

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

// Multer memory storage for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Cloudflare R2 client
const s3 = new AWS.S3({
    endpoint: new AWS.Endpoint(process.env.R2_ENDPOINT),
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    signatureVersion: 'v4',
    region: 'auto',
});

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

// ================= Create a new post with attachments =================
router.post('/', verifyToken, upload.array('files', 10), async (req, res) => {
    const { content, visibility = 'public' } = req.body;

    if (!content || content.trim() === '' && (!req.files || req.files.length === 0)) {
        return res.status(400).json({ error: 'Post content or files cannot be empty' });
    }

    try {
        // 1️⃣ Insert post first
        const postResult = await pool.query(
            `INSERT INTO posts (user_id, content, visibility)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [req.user.id, content || null, visibility]
        );

        const post = postResult.rows[0];

        // 2️⃣ If files were uploaded, save them to R2 and link to attachments table
        if (req.files && req.files.length > 0) {
            const attachmentPromises = req.files.map(async (file) => {
                const key = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
                const params = {
                    Bucket: process.env.R2_BUCKET_NAME,
                    Key: key,
                    Body: file.buffer,
                    ContentType: file.mimetype,
                };
                await s3.upload(params).promise();

                const fileUrl = `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${key}`;

                // Save attachment record in DB
                await pool.query(
                    `INSERT INTO attachments (post_id, file_name, file_url)
                     VALUES ($1, $2, $3)`,
                    [post.id, file.originalname, fileUrl]
                );

                return { file_name: file.originalname, url: fileUrl };
            });

            const uploadedFiles = await Promise.all(attachmentPromises);
            post.attachments = uploadedFiles; // attach to response
        } else {
            post.attachments = [];
        }

        await logPostActivity({ userId: req.user.id, postId: post.id, type: 'create', success: true, req });

        res.status(201).json(post);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create post', details: err.message });
    }
});

// ================= Get all posts with likes, attachments, and liked_by_user =================
router.get('/', verifyToken, async (req, res) => {
    try {
      const userId = req.user.id; // from verifyToken middleware
  
      // Fetch all posts + user info
      const postsResult = await pool.query(
        `SELECT p.*, u.username, u.first_name, u.last_name
         FROM posts p
         JOIN users u ON p.user_id = u.id
         WHERE p.is_deleted = false
         ORDER BY p.created_at DESC`
      );
  
      // For each post, attach attachments + like data
      const posts = await Promise.all(
        postsResult.rows.map(async (post) => {
          // 1️⃣ Get attachments
          const attachResult = await pool.query(
            `SELECT id, file_name, file_url, uploaded_at
             FROM attachments
             WHERE post_id = $1`,
            [post.id]
          );
  
          // 2️⃣ Get like count
          const likeCountResult = await pool.query(
            `SELECT COUNT(*) AS like_count
             FROM likes
             WHERE target_type = 'post' AND target_id = $1`,
            [post.id]
          );
  
          // 3️⃣ Get list of likes (who liked)
          const likesResult = await pool.query(
            `SELECT user_id
             FROM likes
             WHERE target_type = 'post' AND target_id = $1`,
            [post.id]
          );
  
          // 4️⃣ Check if current user liked it
          const userLiked = likesResult.rows.some((like) => like.user_id === userId);
  
          // ✅ Add computed fields
          post.like_count = parseInt(likeCountResult.rows[0].like_count, 10) || 0;
          post.likes = likesResult.rows; // store user_ids who liked
          post.attachments = attachResult.rows;
          post.liked_by_user = userLiked;
  
          return post;
        })
      );
  
      res.json(posts);
    } catch (err) {
      console.error('Error fetching posts with likes:', err);
      res.status(500).json({ error: 'Failed to fetch posts' });
    }
  });
  

// ================= Get a single post by ID =================
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

        const attachResult = await pool.query(
            `SELECT id, file_name, file_url, uploaded_at
             FROM attachments
             WHERE post_id = $1`,
            [req.params.id]
        );

        const post = result.rows[0];
        post.attachments = attachResult.rows;

        res.json(post);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch post' });
    }
});

// ================= Update a post =================
router.put('/:id', verifyToken, async (req, res) => {
    const { content, visibility } = req.body;

    try {
        const result = await pool.query(
            `UPDATE posts
             SET content = COALESCE($1, content),
                 visibility = COALESCE($2, visibility),
                 is_edited = true,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3 AND user_id = $4
             RETURNING *`,
            [content, visibility, req.params.id, req.user.id]
        );

        if (result.rows.length === 0)
            return res.status(403).json({ error: 'Unauthorized or post not found' });

        await logPostActivity({ userId: req.user.id, postId: req.params.id, type: 'edit', success: true, req });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update post' });
    }
});

// ================= Soft delete a post =================
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
        console.error(err);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});

// ================= Get all posts by a specific user =================
router.get('/user/:userId', verifyToken, async (req, res) => {
    try {
        const currentUserId = req.user.id; // logged-in user
        const targetUserId = req.params.userId; // posts we want

        const postsResult = await pool.query(
            `SELECT p.*, u.username, u.first_name, u.last_name
             FROM posts p
             JOIN users u ON p.user_id = u.id
             WHERE p.user_id = $1 AND p.is_deleted = false
             ORDER BY p.created_at DESC`,
            [targetUserId]
        );

        const posts = await Promise.all(
            postsResult.rows.map(async (post) => {
                // Fetch attachments
                const attachResult = await pool.query(
                    `SELECT id, file_name, file_url, uploaded_at
                     FROM attachments
                     WHERE post_id = $1`,
                    [post.id]
                );

                // Fetch like count
                const likeCountResult = await pool.query(
                    `SELECT COUNT(*) AS like_count
                     FROM likes
                     WHERE target_type = 'post' AND target_id = $1`,
                    [post.id]
                );

                // Fetch detailed likes
                const likesResult = await pool.query(
                    `SELECT 
                        l.id AS like_id,
                        l.user_id,
                        l.reaction_type,
                        l.created_at,
                        u.username
                     FROM likes l
                     JOIN users u ON l.user_id = u.id
                     WHERE l.target_type = 'post' AND l.target_id = $1
                     ORDER BY l.created_at DESC`,
                    [post.id]
                );

                // Check if current user liked it
                const userLiked = likesResult.rows.some(like => like.user_id === currentUserId);

                post.like_count = parseInt(likeCountResult.rows[0].like_count, 10) || 0;
                post.likes = likesResult.rows;
                post.attachments = attachResult.rows;
                post.liked_by_user = userLiked;

                return post;
            })
        );

        res.json(posts);
    } catch (err) {
        console.error('Error fetching user posts with like details:', err);
        res.status(500).json({ error: 'Failed to fetch user posts with like details' });
    }
});





// ================= Like a post =================
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
        console.error(err);
        res.status(500).json({ error: 'Failed to like post' });
    }
});

// ================= Unlike a post =================
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
        console.error(err);
        res.status(500).json({ error: 'Failed to unlike post' });
    }
});

module.exports = router;
