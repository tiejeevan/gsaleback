const express = require("express");
const router = express.Router();
const pool = require("../db");
const verifyToken = require('../middleware/authMiddleware');
const mentionsService = require('../services/mentionsService');
// ========================
// 1️⃣ Get user notifications (exclude soft deleted)
// ========================
router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT n.*, 
              u.username AS actor_name,
              n.created_at AT TIME ZONE 'UTC' AS created_at
       FROM notifications n
       LEFT JOIN users u ON n.actor_user_id = u.id
       WHERE n.recipient_user_id = $1 AND n.deleted_at IS NULL
       ORDER BY n.created_at DESC`,
      [userId]
    );
    
    // Ensure created_at is in ISO format
    const notifications = result.rows.map(row => ({
      ...row,
      created_at: new Date(row.created_at).toISOString()
    }));
    
    res.json(notifications);
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ========================
// 2️⃣ Mark one as read (soft delete if mention)
// ========================
router.put("/:id/read", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Get notification details
    const notifResult = await pool.query(
      `SELECT * FROM notifications WHERE id = $1 AND recipient_user_id = $2`,
      [id, userId]
    );
    
    if (notifResult.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }
    
    const notification = notifResult.rows[0];
    
    // Mark as read
    await pool.query(
      `UPDATE notifications SET is_read = true 
       WHERE id = $1 AND recipient_user_id = $2`,
      [id, userId]
    );
    
    // If it's a mention notification, soft delete it and the mention record
    if (notification.type === 'mention') {
      await pool.query(
        `UPDATE notifications SET deleted_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [id]
      );
      
      // Also soft delete the mention record
      const commentId = notification.payload?.commentId;
      if (commentId) {
        await mentionsService.softDeleteMention(commentId, userId);
      }
      
      // Emit real-time event to remove notification from UI
      const io = req.app.get("io");
      if (io) {
        io.to(`user_${userId}`).emit("notification:deleted", { notificationId: parseInt(id) });
      }
    }
    
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
// 5️⃣ Soft delete notification
// ========================
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Get notification details
    const notifResult = await pool.query(
      `SELECT * FROM notifications WHERE id = $1 AND recipient_user_id = $2`,
      [id, userId]
    );
    
    if (notifResult.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }
    
    const notification = notifResult.rows[0];
    
    // Soft delete the notification
    await pool.query(
      `UPDATE notifications SET deleted_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND recipient_user_id = $2`,
      [id, userId]
    );
    
    // If it's a mention, also soft delete the mention record
    if (notification.type === 'mention') {
      const commentId = notification.payload?.commentId;
      if (commentId) {
        await mentionsService.softDeleteMention(commentId, userId);
      }
    }
    
    // Emit real-time event to remove notification from UI
    const io = req.app.get("io");
    if (io) {
      io.to(`user_${userId}`).emit("notification:deleted", { notificationId: parseInt(id) });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting notification:", err);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

module.exports = router;
