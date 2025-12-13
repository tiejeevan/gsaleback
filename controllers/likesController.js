// controllers/likesController.js
const pool = require('../db');

// ✅ Add a like
exports.addLike = async (req, res) => {
  const { target_type, target_id, reaction_type = 'like' } = req.body;
  const userId = req.user.id; // assuming you use auth middleware

  try {
    // Check if this is a new like (not an update)
    const existingLike = await pool.query(
      'SELECT id FROM likes WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
      [userId, target_type, target_id]
    );

    const isNewLike = existingLike.rows.length === 0;

    const result = await pool.query(
      `INSERT INTO likes (user_id, target_type, target_id, reaction_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, target_type, target_id)
       DO UPDATE SET reaction_type = EXCLUDED.reaction_type, updated_at = NOW()
       RETURNING *`,
      [userId, target_type, target_id, reaction_type]
    );

    // Only create notification for new likes on posts
    if (isNewLike && target_type === 'post') {
      // Get the post owner to send notification
      const postOwner = await pool.query(
        'SELECT user_id FROM posts WHERE id = $1',
        [target_id]
      );

      if (postOwner.rows.length > 0) {
        const recipientUserId = postOwner.rows[0].user_id;
        
        // Don't send notification if user likes their own post
        if (recipientUserId !== userId) {
          // Check if notification already exists for this post and user combination
          const existingNotification = await pool.query(
            `SELECT id FROM notifications 
             WHERE recipient_user_id = $1 AND actor_user_id = $2 AND type = 'like' 
             AND payload->>'target_id' = $3`,
            [recipientUserId, userId, target_id.toString()]
          );

          // Only create notification if it doesn't exist
          if (existingNotification.rows.length === 0) {
            const notificationResult = await pool.query(
              `INSERT INTO notifications (recipient_user_id, actor_user_id, type, payload)
               VALUES ($1, $2, $3, $4)
               RETURNING *`,
              [
                recipientUserId,
                userId,
                'like',
                JSON.stringify({
                  target_type,
                  target_id,
                  message: 'liked your post'
                })
              ]
            );

            // Send real-time notification
            const io = req.app.get('io');
            if (io) {
              io.to(`user_${recipientUserId}`).emit('notification:new', notificationResult.rows[0]);
            }
          }
        }
      }
    }

    // Update the posts.likes_count column for posts
    if (target_type === 'post') {
      await pool.query(
        'UPDATE posts SET likes_count = (SELECT COUNT(*) FROM likes WHERE target_type = $1 AND target_id = $2) WHERE id = $2',
        [target_type, target_id]
      );
    }

    // Emit like event for real-time like updates
    const io = req.app.get('io');
    if (io) {
      // Emit to the specific post room
      const eventName = `post_${target_id}:like:new`;
      const eventData = {
        target_type,
        target_id,
        user_id: userId,
        reaction_type,
      };
      console.log(`📡 Emitting ${eventName} to room post_${target_id}:`, eventData);
      io.to(`post_${target_id}`).emit(eventName, eventData);
    }

    res.status(201).json({ success: true, like: result.rows[0] });
  } catch (err) {
    console.error('Error adding like:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ✅ Remove a like
exports.removeLike = async (req, res) => {
  const { target_type, target_id } = req.body;
  const userId = req.user.id;

  try {
    const deleteResult = await pool.query(
      'DELETE FROM likes WHERE user_id = $1 AND target_type = $2 AND target_id = $3 RETURNING *',
      [userId, target_type, target_id]
    );

    // Note: We don't remove notifications when someone unlikes
    // This ensures only ONE notification per user per post (ever)

    // Update the posts.likes_count column for posts
    if (target_type === 'post') {
      await pool.query(
        'UPDATE posts SET likes_count = (SELECT COUNT(*) FROM likes WHERE target_type = $1 AND target_id = $2) WHERE id = $2',
        [target_type, target_id]
      );
    }

    // Emit socket event for real-time update
    const io = req.app.get('io');
    if (io) {
      // Emit to the specific post room
      const eventName = `post_${target_id}:like:new`;
      const eventData = {
        target_type,
        target_id,
        user_id: userId,
        reaction_type: 'unlike', // mark it as unlike
      };
      console.log(`📡 Emitting ${eventName} to room post_${target_id}:`, eventData);
      io.to(`post_${target_id}`).emit(eventName, eventData);
    }
    res.json({ success: true, message: 'Like removed' });
  } catch (err) {
    console.error('Error removing like:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ✅ Get all likes for a specific target (e.g., post)
exports.getLikesForTarget = async (req, res) => {
  const { target_type, target_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT l.*, u.username, u.profile_image
       FROM likes l
       JOIN users u ON u.id = l.user_id
       WHERE l.target_type = $1 AND l.target_id = $2
       ORDER BY l.created_at DESC`,
      [target_type, target_id]
    );

    res.json({ success: true, likes: result.rows });
  } catch (err) {
    console.error('Error fetching likes:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ✅ Get total like count for a target
exports.getLikeCount = async (req, res) => {
  const { target_type, target_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM likes
       WHERE target_type = $1 AND target_id = $2`,
      [target_type, target_id]
    );

    res.json({ success: true, count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    console.error('Error counting likes:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
