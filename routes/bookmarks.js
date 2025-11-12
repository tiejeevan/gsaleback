const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

// Add bookmark
router.post("/", authenticateToken, async (req, res) => {
  const { post_id } = req.body;
  const user_id = req.user.id;

  try {
    // Check if already bookmarked
    const existing = await pool.query(
      "SELECT * FROM bookmarks WHERE user_id = $1 AND post_id = $2",
      [user_id, post_id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Post already bookmarked" });
    }

    const result = await pool.query(
      "INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2) RETURNING *",
      [user_id, post_id]
    );

    res.json({ message: "Post bookmarked", bookmark: result.rows[0] });
  } catch (error) {
    console.error("Error adding bookmark:", error);
    res.status(500).json({ error: "Failed to bookmark post" });
  }
});

// Remove bookmark
router.delete("/:postId", authenticateToken, async (req, res) => {
  const { postId } = req.params;
  const user_id = req.user.id;

  try {
    const result = await pool.query(
      "DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2 RETURNING *",
      [user_id, postId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Bookmark not found" });
    }

    res.json({ message: "Bookmark removed" });
  } catch (error) {
    console.error("Error removing bookmark:", error);
    res.status(500).json({ error: "Failed to remove bookmark" });
  }
});

// Get user's bookmarked posts
router.get("/", authenticateToken, async (req, res) => {
  const user_id = req.user.id;

  try {
    const result = await pool.query(
      `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_image,
              COUNT(DISTINCT l.id) as like_count,
              EXISTS(SELECT 1 FROM likes WHERE target_type = 'post' AND target_id = p.id AND user_id = $1) as liked_by_user,
              true as bookmarked_by_user
       FROM bookmarks b
       JOIN posts p ON b.post_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN likes l ON l.target_type = 'post' AND l.target_id = p.id
       WHERE b.user_id = $1 AND p.is_deleted = false
       GROUP BY p.id, u.username, u.first_name, u.last_name, u.profile_image
       ORDER BY b.created_at DESC`,
      [user_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching bookmarked posts:", error);
    res.status(500).json({ error: "Failed to fetch bookmarked posts" });
  }
});

module.exports = router;
