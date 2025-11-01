const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../db');
const multer = require('multer');
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

// Multer memory storage for file uploads (optional)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ================= Helper: Log Comment Activity =================
const logCommentActivity = async ({ userId, commentId, type, success, req }) => {
  try {
    await pool.query(
      `INSERT INTO comment_logs (user_id, comment_id, activity_type, ip_address, user_agent, success)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, commentId, type, req.ip, req.get('User-Agent'), success]
    );
  } catch (err) {
    // non-fatal logging error
    console.error('Error logging comment activity:', err.message);
  }
};

// ================= Helper: build nested tree from flat comments =================
const buildCommentsTree = (rows) => {
  const map = new Map();
  const roots = [];

  // normalize rows and map by id
  rows.forEach(r => {
    r.children = [];
    map.set(String(r.id), r);
  });

  rows.forEach(r => {
    if (!r.parent_comment_id) {
      roots.push(r);
    } else {
      const parent = map.get(String(r.parent_comment_id));
      if (parent) parent.children.push(r);
      else roots.push(r); // orphaned child -> treat as root
    }
  });

  return roots;
};

// ================= Create a new comment =================
// Accepts: post_id (required), parent_comment_id (optional), content (required unless files), files[] (optional)
router.post('/', verifyToken, upload.array('files', 10), async (req, res) => {
  const { post_id, parent_comment_id, content } = req.body;

  if ((!content || content.trim() === '') && (!req.files || req.files.length === 0)) {
    return res.status(400).json({ error: 'Comment content or files cannot be empty' });
  }

  try {
    // Validate post exists and not deleted
    const postRes = await pool.query(`SELECT id FROM posts WHERE id = $1 AND is_deleted = false`, [post_id]);
    if (postRes.rows.length === 0) return res.status(404).json({ error: 'Post not found' });

    // Determine parent path (if reply)
    let parentPath = null;
    if (parent_comment_id) {
      const parentRes = await pool.query(`SELECT path, is_deleted FROM comments WHERE id = $1`, [parent_comment_id]);
      if (parentRes.rows.length === 0) return res.status(400).json({ error: 'Parent comment not found' });
      if (parentRes.rows[0].is_deleted) return res.status(400).json({ error: 'Parent comment is deleted' });
      parentPath = parentRes.rows[0].path;
    }

    // Handle attachments: small helper — either upload to R2/S3 here or store metadata (we store metadata URL placeholders)
    let attachments = null;
    if (req.files && req.files.length > 0) {
      attachments = req.files.map(file => ({
        file_name: file.originalname,
        // NOTE: If you want to upload to R2/S3, do it here and set 'url' to the real URL.
        // For now we put a placeholder path; replace with your S3/R2 logic if desired.
        url: `uploads/${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`,
        mime_type: file.mimetype,
        size: file.size
      }));
    }

    // Insert comment (path will be updated after we know the id)
    const insertRes = await pool.query(
      `INSERT INTO comments (post_id, user_id, parent_comment_id, content, attachments, is_deleted, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [post_id, req.user.id, parent_comment_id || null, content || null, attachments]
    );

    if (!insertRes.rows.length) throw new Error('Failed to create comment');
    const comment = insertRes.rows[0];

    // Build new path (if parent exists, parent.path + '/' + id, else id)
    const newPath = parentPath ? `${parentPath}/${comment.id}` : `${comment.id}`;
    await pool.query(`UPDATE comments SET path = $1 WHERE id = $2`, [newPath, comment.id]);
    comment.path = newPath;

    // Optionally increment post comment_count
    await pool.query(`UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1`, [post_id]);

    await logCommentActivity({ userId: req.user.id, commentId: comment.id, type: 'create', success: true, req });

    res.status(201).json(comment);
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: 'Failed to create comment', details: err.message });
  }
});

// ================= Get all comments for a post (nested) =================
router.get('/:postId', verifyToken, async (req, res) => {
    try {
      const { postId } = req.params;
      const userId = req.user.id;
  
      // Fetch comments and user info ordered by path so replies are grouped
      const commentsRes = await pool.query(
        `SELECT c.*, u.username, u.first_name, u.last_name
         FROM comments c
         JOIN users u ON c.user_id = u.id
         WHERE c.post_id = $1 AND c.is_deleted = false
         ORDER BY c.path ASC`,
        [postId]
      );
  
      let rows = commentsRes.rows;
  
      // Normalize numeric IDs
      rows = rows.map(r => ({
        ...r,
        id: Number(r.id),
        user_id: Number(r.user_id),
        parent_comment_id: r.parent_comment_id ? Number(r.parent_comment_id) : null,
      }));
  
      // Batch fetch like counts and current user's likes to avoid N+1
      const commentIds = rows.map(r => r.id);
      let likesMap = new Map();
      let userLikedSet = new Set();
  
      if (commentIds.length > 0) {
        const likesCountRes = await pool.query(
          `SELECT comment_id, COUNT(*) AS cnt FROM comment_likes WHERE comment_id = ANY($1::bigint[]) GROUP BY comment_id`,
          [commentIds]
        );
        likesCountRes.rows.forEach(r => likesMap.set(Number(r.comment_id), parseInt(r.cnt, 10)));
  
        const userLikesRes = await pool.query(
          `SELECT comment_id FROM comment_likes WHERE comment_id = ANY($1::bigint[]) AND user_id = $2`,
          [commentIds, userId]
        );
        userLikesRes.rows.forEach(r => userLikedSet.add(Number(r.comment_id)));
      }
  
      // Attach like_count and liked_by_user
      rows.forEach(r => {
        r.like_count = likesMap.get(r.id) || 0;
        r.liked_by_user = userLikedSet.has(r.id);
      });
  
      // Build nested structure
      const nested = buildCommentsTree(rows);
  
      res.json(nested);
    } catch (err) {
      console.error('Fetch comments error:', err);
      res.status(500).json({ error: 'Failed to fetch comments', details: err.message });
    }
  });
  

// ================= Edit a comment =================
router.put('/:id', verifyToken, async (req, res) => {
  const { content, attachments } = req.body; // attachments optional JSON array
  const { id } = req.params;

  if ((!content || content.trim() === '') && !attachments) {
    return res.status(400).json({ error: 'Content or attachments required to edit' });
  }

  try {
    // Fetch existing comment
    const commentRes = await pool.query(`SELECT * FROM comments WHERE id = $1`, [id]);
    if (!commentRes.rows.length) return res.status(404).json({ error: 'Comment not found' });
    const comment = commentRes.rows[0];

    if (comment.user_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
    if (comment.is_deleted) return res.status(400).json({ error: 'Cannot edit a deleted comment' });

    // Insert into edit history
    await pool.query(
      `INSERT INTO comment_edit_history (comment_id, old_content, attachments, edited_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [id, comment.content, comment.attachments]
    );

    // Update comment (merge attachments if provided; here we replace if attachments present)
    const updated = await pool.query(
      `UPDATE comments
       SET content = COALESCE($1, content),
           attachments = COALESCE($2, attachments),
           edit_count = COALESCE(edit_count, 0) + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [content, attachments ? attachments : null, id]
    );

    await logCommentActivity({ userId: req.user.id, commentId: id, type: 'edit', success: true, req });

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Edit comment error:', err);
    res.status(500).json({ error: 'Failed to edit comment', details: err.message });
  }
});

// ================= Soft delete a comment =================
router.delete('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const commentRes = await pool.query(`SELECT * FROM comments WHERE id = $1`, [id]);
    if (!commentRes.rows.length) return res.status(404).json({ error: 'Comment not found' });
    const comment = commentRes.rows[0];

    if (comment.user_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });

    await pool.query(`UPDATE comments SET is_deleted = true WHERE id = $1`, [id]);

    // Optionally decrement post comment_count (ensure not negative)
    await pool.query(`UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1`, [comment.post_id]);

    await logCommentActivity({ userId: req.user.id, commentId: id, type: 'delete', success: true, req });

    res.json({ msg: 'Comment deleted successfully' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: 'Failed to delete comment', details: err.message });
  }
});

// ================= Like a comment =================
router.post('/:id/like', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    // ensure comment exists and not deleted
    const commentRes = await pool.query(`SELECT id FROM comments WHERE id = $1 AND is_deleted = false`, [id]);
    if (!commentRes.rows.length) return res.status(404).json({ error: 'Comment not found' });

    // prevent duplicate
    const existsRes = await pool.query(
      `SELECT 1 FROM comment_likes WHERE comment_id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (existsRes.rows.length > 0) return res.status(400).json({ error: 'Already liked' });

    await pool.query(`INSERT INTO comment_likes (comment_id, user_id, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)`, [id, req.user.id]);

    await logCommentActivity({ userId: req.user.id, commentId: id, type: 'like', success: true, req });

    res.json({ msg: 'Comment liked' });
  } catch (err) {
    console.error('Like comment error:', err);
    res.status(500).json({ error: 'Failed to like comment', details: err.message });
  }
});

// ================= Unlike a comment =================
router.post('/:id/unlike', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2`, [id, req.user.id]);

    await logCommentActivity({ userId: req.user.id, commentId: id, type: 'unlike', success: true, req });

    res.json({ msg: 'Comment unliked' });
  } catch (err) {
    console.error('Unlike comment error:', err);
    res.status(500).json({ error: 'Failed to unlike comment', details: err.message });
  }
});

// ================= Get comment edit history =================
router.get('/:id/history', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const historyRes = await pool.query(
      `SELECT id, old_content, attachments, edited_at
       FROM comment_edit_history
       WHERE comment_id = $1
       ORDER BY edited_at DESC`,
      [id]
    );

    res.json(historyRes.rows);
  } catch (err) {
    console.error('Comment history error:', err);
    res.status(500).json({ error: 'Failed to get comment history', details: err.message });
  }
});

module.exports = router;
