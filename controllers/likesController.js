// controllers/likesController.js
const pool = require('../db');

// ✅ Add a like
exports.addLike = async (req, res) => {
  const { target_type, target_id, reaction_type = 'like' } = req.body;
  const userId = req.user.id; // assuming you use auth middleware

  try {
    const result = await pool.query(
      `INSERT INTO likes (user_id, target_type, target_id, reaction_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, target_type, target_id)
       DO UPDATE SET reaction_type = EXCLUDED.reaction_type, updated_at = NOW()
       RETURNING *`,
      [userId, target_type, target_id, reaction_type]
    );

    const io = req.app.get('io');
    if (io) {
      console.log("📡 [Socket Emit → Room] Emitting like event to room:", {
        room: `post_${target_id}`,
        target_type,
        target_id,
        user_id: userId,
        reaction_type,
      });
      io.emit(`post_${target_id}:like:new`, {
        target_type,
        target_id,
        user_id: userId,
        reaction_type,
      });
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
    await pool.query(
      'DELETE FROM likes WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
      [userId, target_type, target_id]
    );
    // 2️⃣ Emit socket event for real-time update
    const io = req.app.get('io');
    if (io) {
      console.log(
        `[Socket Emit] Emitting unlike event → post_${target_id}:like:new | target_type: ${target_type}, target_id: ${target_id}, user_id: ${userId}, reaction_type: unlike`
      );
      io.emit(`post_${target_id}:like:new`, {
        target_type,
        target_id,
        user_id: userId,
        reaction_type: 'unlike', // mark it as unlike
      });
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
