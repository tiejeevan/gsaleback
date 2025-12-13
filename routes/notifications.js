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
       WHERE n.recipient_user_id = $1
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
    
    // Mark as read (no more soft delete for mentions)
    const updateResult = await pool.query(
      `UPDATE notifications SET read = true 
       WHERE id = $1 AND recipient_user_id = $2
       RETURNING id, read`,
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
      `UPDATE notifications SET read = true 
       WHERE recipient_user_id = $1 AND read = false`,
      [userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error marking all as read:", err);
    res.status(500).json({ error: "Failed to mark all as read" });
  }
});

// ========================
// 4️⃣ Get notification statistics
// ========================
router.get("/stats", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get total count
    const totalResult = await pool.query(
      `SELECT COUNT(*) as total FROM notifications WHERE recipient_user_id = $1`,
      [userId]
    );
    
    // Get unread count
    const unreadResult = await pool.query(
      `SELECT COUNT(*) as unread FROM notifications WHERE recipient_user_id = $1 AND read = false`,
      [userId]
    );
    
    // Get counts by type
    const typeResult = await pool.query(
      `SELECT type, COUNT(*) as count 
       FROM notifications 
       WHERE recipient_user_id = $1 
       GROUP BY type 
       ORDER BY count DESC`,
      [userId]
    );
    
    // Get recent activity (last 7 days)
    const recentResult = await pool.query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM notifications 
       WHERE recipient_user_id = $1 
       AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [userId]
    );
    
    res.json({
      total: parseInt(totalResult.rows[0].total),
      unread: parseInt(unreadResult.rows[0].unread),
      byType: typeResult.rows.reduce((acc, row) => {
        acc[row.type] = parseInt(row.count);
        return acc;
      }, {}),
      recentActivity: recentResult.rows
    });
  } catch (err) {
    console.error("Error fetching notification stats:", err);
    res.status(500).json({ error: "Failed to fetch notification stats" });
  }
});

// ========================
// 5️⃣ Create new notification
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
      [recipient_user_id, actor_user_id, type, JSON.stringify(payload)]
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
// 6️⃣ Soft delete notification
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
    
    // Delete the notification
    await pool.query(
      `DELETE FROM notifications WHERE id = $1 AND recipient_user_id = $2`,
      [id, userId]
    );
    
    // Note: We no longer soft delete mention records when deleting notifications
    
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
