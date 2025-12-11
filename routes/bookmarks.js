const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

// Add bookmark (supports both posts and products)
router.post("/", authenticateToken, async (req, res) => {
  const { post_id, item_type, item_id } = req.body;
  const user_id = req.user.id;

  try {
    // Support legacy post_id or new polymorphic approach
    const type = item_type || 'post';
    const id = item_id || post_id;

    if (!id) {
      return res.status(400).json({ error: "item_id or post_id is required" });
    }

    if (!['post', 'product'].includes(type)) {
      return res.status(400).json({ error: "item_type must be 'post' or 'product'" });
    }

    // Check if already bookmarked
    const existing = await pool.query(
      "SELECT * FROM bookmarks WHERE user_id = $1 AND item_type = $2 AND item_id = $3",
      [user_id, type, id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: `${type.charAt(0).toUpperCase() + type.slice(1)} already bookmarked` });
    }

    const result = await pool.query(
      "INSERT INTO bookmarks (user_id, item_type, item_id) VALUES ($1, $2, $3) RETURNING *",
      [user_id, type, id]
    );

    res.json({ message: `${type.charAt(0).toUpperCase() + type.slice(1)} bookmarked`, bookmark: result.rows[0] });
  } catch (error) {
    console.error("Error adding bookmark:", error);
    res.status(500).json({ error: "Failed to add bookmark" });
  }
});

// Remove bookmark (polymorphic)
router.delete("/:itemType/:itemId", authenticateToken, async (req, res) => {
  const { itemType, itemId } = req.params;
  const user_id = req.user.id;

  try {
    const result = await pool.query(
      "DELETE FROM bookmarks WHERE user_id = $1 AND item_type = $2 AND item_id = $3 RETURNING *",
      [user_id, itemType, itemId]
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

// Legacy endpoint for backward compatibility
router.delete("/:postId", authenticateToken, async (req, res) => {
  const { postId } = req.params;
  const user_id = req.user.id;

  try {
    const result = await pool.query(
      "DELETE FROM bookmarks WHERE user_id = $1 AND item_type = 'post' AND item_id = $2 RETURNING *",
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

// Get user's bookmarks (posts and/or products)
router.get("/", authenticateToken, async (req, res) => {
  const user_id = req.user.id;
  const { type } = req.query; // Optional filter: 'post', 'product', or undefined for all

  console.log(`Fetching bookmarks for user ${user_id}, type: ${type || 'all'}`);

  try {
    let bookmarks = [];

    // Fetch posts if type is 'post' or undefined
    if (!type || type === 'post') {
      const posts = await pool.query(
        `SELECT 
          'post' as item_type,
          p.id as item_id,
          p.*,
          u.username, u.first_name, u.last_name, u.profile_image,
          COUNT(DISTINCT l.id) as like_count,
          EXISTS(SELECT 1 FROM likes WHERE target_type = 'post' AND target_id = p.id AND user_id = $1) as liked_by_user,
          true as bookmarked_by_user,
          b.created_at as bookmarked_at
         FROM bookmarks b
         JOIN posts p ON b.item_id::integer = p.id AND b.item_type = 'post'
         JOIN users u ON p.user_id = u.id
         LEFT JOIN likes l ON l.target_type = 'post' AND l.target_id = p.id
         WHERE b.user_id = $1 AND p.is_deleted = false
         GROUP BY p.id, u.username, u.first_name, u.last_name, u.profile_image, b.created_at
         ORDER BY b.created_at DESC`,
        [user_id]
      );
      bookmarks = bookmarks.concat(posts.rows);
    }

    // Fetch products if type is 'product' or undefined
    if (!type || type === 'product') {
      const products = await pool.query(
        `SELECT 
          'product' as item_type,
          pr.id as item_id,
          pr.*,
          u.username, u.first_name, u.last_name, u.profile_image,
          c.name as category_name,
          true as bookmarked_by_user,
          b.created_at as bookmarked_at
         FROM bookmarks b
         JOIN products pr ON b.item_id::uuid = pr.id AND b.item_type = 'product'
         JOIN users u ON pr.created_by = u.id
         LEFT JOIN categories c ON pr.category_id = c.id
         WHERE b.user_id = $1 AND pr.deleted_at IS NULL
         ORDER BY b.created_at DESC`,
        [user_id]
      );
      bookmarks = bookmarks.concat(products.rows);
    }

    // Sort all bookmarks by bookmarked_at if fetching both types
    if (!type) {
      bookmarks.sort((a, b) => new Date(b.bookmarked_at) - new Date(a.bookmarked_at));
    }

    console.log(`Returning ${bookmarks.length} bookmarks for user ${user_id}`);
    res.json(bookmarks);
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    res.status(500).json({ error: "Failed to fetch bookmarks" });
  }
});

module.exports = router;
