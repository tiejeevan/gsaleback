const pool = require('../db');

// ==================== MESSAGE MANAGEMENT ====================

// Get messages for a chat (with pagination)
exports.getChatMessages = async (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    try {
        // Verify user is participant
        const participantCheck = await pool.query(`
            SELECT id FROM chat_participants
            WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL
        `, [chatId, userId]);

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const result = await pool.query(`
            SELECT 
                m.*,
                u.username,
                u.profile_image as avatar_url,
                u.profile_image as sender_profile_image,
                json_agg(
                    json_build_object(
                        'id', ma.id,
                        'file_url', ma.file_url,
                        'file_name', ma.file_name,
                        'file_type', ma.file_type,
                        'file_size', ma.file_size,
                        'thumbnail_url', ma.thumbnail_url,
                        'width', ma.width,
                        'height', ma.height,
                        'duration', ma.duration
                    )
                ) FILTER (WHERE ma.id IS NOT NULL) as attachments,
                (
                    SELECT json_agg(
                        json_build_object(
                            'emoji', mr.emoji,
                            'user_id', mr.user_id,
                            'username', ru.username
                        )
                    )
                    FROM message_reactions mr
                    JOIN users ru ON mr.user_id = ru.id
                    WHERE mr.message_id = m.id
                ) as reactions,
                (
                    SELECT json_agg(
                        json_build_object(
                            'user_id', ms.user_id,
                            'status', ms.status,
                            'updated_at', ms.updated_at
                        )
                    )
                    FROM message_status ms
                    WHERE ms.message_id = m.id
                ) as read_by
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.id
            LEFT JOIN message_attachments ma ON m.id = ma.message_id
            WHERE m.chat_id = $1 AND m.is_deleted = FALSE
            GROUP BY m.id, u.username, u.profile_image
            ORDER BY m.created_at DESC
            LIMIT $2 OFFSET $3
        `, [chatId, limit, offset]);

        res.json({ success: true, messages: result.rows });
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Send a message
exports.sendMessage = async (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { content, type = 'text', replyTo } = req.body;

    if (!content && type === 'text') {
        return res.status(400).json({ success: false, message: 'Content is required' });
    }

    try {
        // Verify user is participant
        const participantCheck = await pool.query(`
            SELECT id FROM chat_participants
            WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL
        `, [chatId, userId]);

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const result = await pool.query(`
            INSERT INTO messages (chat_id, sender_id, content, type, reply_to)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [chatId, userId, content, type, replyTo]);

        const message = result.rows[0];

        // Get user info for the message
        const userInfo = await pool.query(`
            SELECT username, profile_image FROM users WHERE id = $1
        `, [userId]);

        const enrichedMessage = {
            ...message,
            username: userInfo.rows[0].username,
            avatar_url: userInfo.rows[0].profile_image,
            sender_profile_image: userInfo.rows[0].profile_image,
            reactions: []
        };

        // Emit socket event for real-time
        const io = req.app.get('io');
        if (io) {
            io.to(`chat_${chatId}`).emit('message:new', enrichedMessage);
            
            // Also notify all participants in their user rooms (for new chats or when not in chat room)
            const participantsResult = await pool.query(`
                SELECT user_id FROM chat_participants
                WHERE chat_id = $1 AND user_id != $2 AND left_at IS NULL
            `, [chatId, userId]);
            
            participantsResult.rows.forEach(participant => {
                io.to(`user_${participant.user_id}`).emit('chat:new_message', {
                    chatId,
                    message: enrichedMessage
                });
            });
        }

        res.status(201).json({ success: true, message: enrichedMessage });
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Edit message
exports.editMessage = async (req, res) => {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content) {
        return res.status(400).json({ success: false, message: 'Content is required' });
    }

    try {
        const result = await pool.query(`
            UPDATE messages
            SET content = $2, is_edited = TRUE, updated_at = NOW()
            WHERE id = $1 AND sender_id = $3 AND is_deleted = FALSE
            RETURNING *
        `, [messageId, content, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Message not found or access denied' });
        }

        const message = result.rows[0];

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`chat_${message.chat_id}`).emit('message:edited', message);
        }

        res.json({ success: true, message });
    } catch (err) {
        console.error('Error editing message:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Delete message (soft delete)
exports.deleteMessage = async (req, res) => {
    const userId = req.user.id;
    const { messageId } = req.params;

    try {
        const result = await pool.query(`
            UPDATE messages
            SET is_deleted = TRUE, deleted_at = NOW()
            WHERE id = $1 AND sender_id = $2 AND is_deleted = FALSE
            RETURNING *
        `, [messageId, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Message not found or access denied' });
        }

        const message = result.rows[0];

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`chat_${message.chat_id}`).emit('message:deleted', { messageId });
        }

        res.json({ success: true, message: 'Message deleted' });
    } catch (err) {
        console.error('Error deleting message:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Add reaction to message
exports.addReaction = async (req, res) => {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
        return res.status(400).json({ success: false, message: 'Emoji is required' });
    }

    try {
        // Verify user has access to this message's chat
        const messageCheck = await pool.query(`
            SELECT m.chat_id FROM messages m
            JOIN chat_participants cp ON m.chat_id = cp.chat_id
            WHERE m.id = $1 AND cp.user_id = $2 AND cp.left_at IS NULL
        `, [messageId, userId]);

        if (messageCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const chatId = messageCheck.rows[0].chat_id;

        const result = await pool.query(`
            INSERT INTO message_reactions (message_id, user_id, emoji)
            VALUES ($1, $2, $3)
            ON CONFLICT (message_id, user_id, emoji) DO NOTHING
            RETURNING *
        `, [messageId, userId, emoji]);

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`chat_${chatId}`).emit('reaction:added', {
                messageId,
                userId,
                emoji
            });
        }

        res.status(201).json({ success: true, reaction: result.rows[0] });
    } catch (err) {
        console.error('Error adding reaction:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Remove reaction from message
exports.removeReaction = async (req, res) => {
    const userId = req.user.id;
    const { messageId, emoji } = req.params;

    try {
        // Get chat_id before deleting
        const messageCheck = await pool.query(`
            SELECT m.chat_id FROM messages m
            WHERE m.id = $1
        `, [messageId]);

        if (messageCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        const chatId = messageCheck.rows[0].chat_id;

        await pool.query(`
            DELETE FROM message_reactions
            WHERE message_id = $1 AND user_id = $2 AND emoji = $3
        `, [messageId, userId, emoji]);

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`chat_${chatId}`).emit('reaction:removed', {
                messageId,
                userId,
                emoji
            });
        }

        res.json({ success: true, message: 'Reaction removed' });
    } catch (err) {
        console.error('Error removing reaction:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Mark messages as read
exports.markAsRead = async (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { lastMessageId } = req.body;

    if (!lastMessageId) {
        return res.status(400).json({ success: false, message: 'lastMessageId is required' });
    }

    try {
        // Verify user is participant
        const participantCheck = await pool.query(`
            SELECT id FROM chat_participants
            WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL
        `, [chatId, userId]);

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Update participant's last read
        await pool.query(`
            UPDATE chat_participants
            SET last_read_message_id = $2,
                last_read_at = NOW(),
                unread_count = 0
            WHERE chat_id = $1 AND user_id = $3
        `, [chatId, lastMessageId, userId]);

        // Update message status
        await pool.query(`
            INSERT INTO message_status (message_id, user_id, status)
            SELECT m.id, $2, 'read'
            FROM messages m
            WHERE m.chat_id = $1 
            AND m.id <= $3
            AND m.sender_id != $2
            ON CONFLICT (message_id, user_id) 
            DO UPDATE SET status = 'read', updated_at = NOW()
        `, [chatId, userId, lastMessageId]);

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`chat_${chatId}`).emit('messages:read', {
                chatId: parseInt(chatId),
                userId,
                lastMessageId
            });
        }

        res.json({ success: true, message: 'Messages marked as read' });
    } catch (err) {
        console.error('Error marking as read:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Set typing indicator
exports.setTyping = async (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;
    const duration = 5000; // 5 seconds

    try {
        // Verify user is participant
        const participantCheck = await pool.query(`
            SELECT id FROM chat_participants
            WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL
        `, [chatId, userId]);

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const expiresAt = new Date(Date.now() + duration);
        await pool.query(`
            INSERT INTO typing_indicators (chat_id, user_id, expires_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (chat_id, user_id) 
            DO UPDATE SET started_at = NOW(), expires_at = $3
        `, [chatId, userId, expiresAt]);

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`chat_${chatId}`).emit('user:typing', { userId });
        }

        res.json({ success: true, message: 'Typing indicator set' });
    } catch (err) {
        console.error('Error setting typing:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get who's typing
exports.getTypingUsers = async (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;

    try {
        // Verify user is participant
        const participantCheck = await pool.query(`
            SELECT id FROM chat_participants
            WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL
        `, [chatId, userId]);

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const result = await pool.query(`
            SELECT u.id, u.username, u.profile_image as avatar_url
            FROM typing_indicators ti
            JOIN users u ON ti.user_id = u.id
            WHERE ti.chat_id = $1 AND ti.expires_at > NOW() AND ti.user_id != $2
        `, [chatId, userId]);

        res.json({ success: true, typingUsers: result.rows });
    } catch (err) {
        console.error('Error getting typing users:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
