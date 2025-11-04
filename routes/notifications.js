const express = require("express");
const router = express.Router();
const pool = require("../db");
const verifyToken = require('../middleware/authMiddleware');
// ========================
// 1️⃣ Get user notifications
// ========================
router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT n.*, u.username AS actor_name
       FROM notifications n
       LEFT JOIN users u ON n.actor_user_id = u.id
       WHERE n.recipient_user_id = $1
       ORDER BY n.created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ========================
// 2️⃣ Mark one as read
// ========================
router.put("/:id/read", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await pool.query(
      `UPDATE notifications SET is_read = true 
       WHERE id = $1 AND recipient_user_id = $2`,
      [id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error marking notification as read:", err);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// ========================
// 3️⃣ Mark all as read
// ========================
router.put("/read-all", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    await pool.query(
      `UPDATE notifications SET is_read = true 
       WHERE recipient_user_id = $1 AND is_read = false`,
      [userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error marking all as read:", err);
    res.status(500).json({ error: "Failed to mark all as read" });
  }
});

// ========================
// 4️⃣ Create new notification
// (Used internally, e.g. like/comment triggers this)
// ========================
router.post("/", verifyToken, async (req, res) => {
  try {
    const { recipient_user_id, type, payload } = req.body;
    const actor_user_id = req.user.id;

    const result = await pool.query(
      `INSERT INTO notifications (recipient_user_id, actor_user_id, type, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [recipient_user_id, actor_user_id, type, payload]
    );

    const notif = result.rows[0];

    // Optional: Emit via Socket.IO
    const io = req.app.get("io");
    if (io) {
      io.to(`user_${recipient_user_id}`).emit("notification:new", notif);
    }

    res.json(notif);
  } catch (err) {
    console.error("Error creating notification:", err);
    res.status(500).json({ error: "Failed to create notification" });
  }
});

// ========================
// 5️⃣ Delete (optional)
// ========================
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await pool.query(
      `DELETE FROM notifications WHERE id = $1 AND recipient_user_id = $2`,
      [id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting notification:", err);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

module.exports = router;
