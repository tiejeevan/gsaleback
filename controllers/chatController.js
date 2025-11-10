const pool = require('../db');

// ==================== CHAT MANAGEMENT ====================

// Get user's chat list
exports.getUserChats = async (req, res) => {
    const userId = req.user.id;

    try {
        // Get chats from view
        const chatsResult = await pool.query(`
            SELECT * FROM user_chat_list 
            WHERE user_id = $1 AND hidden = FALSE
            ORDER BY pinned DESC, last_message_at DESC NULLS LAST
        `, [userId]);

        // Get participants for each chat
        const chats = await Promise.all(chatsResult.rows.map(async (chat) => {
            const participantsResult = await pool.query(`
                SELECT 
                    cp.user_id as id,
                    u.username,
                    u.display_name,
                    u.profile_image as avatar_url,
                    cp.role,
                    cp.joined_at,
                    cp.left_at
                FROM chat_participants cp
                JOIN users u ON cp.user_id = u.id
                WHERE cp.chat_id = $1 AND cp.left_at IS NULL
                ORDER BY cp.joined_at
            `, [chat.id]);

            return {
                ...chat,
                participants: participantsResult.rows
            };
        }));

        // For direct chats, deduplicate by keeping only the one with messages
        // or the most recent one if none have messages
        const seenPairs = new Map();
        const filteredChats = [];

        for (const chat of chats) {
            if (chat.type === 'group') {
                filteredChats.push(chat);
                continue;
            }

            // For direct chats, create a unique key from participant IDs
            const participantIds = chat.participants
                .map(p => p.id)
                .sort((a, b) => a - b)
                .join('-');

            const existing = seenPairs.get(participantIds);

            if (!existing) {
                seenPairs.set(participantIds, chat);
                filteredChats.push(chat);
            } else {
                // Keep the one with messages, or the newer one
                if (chat.last_message_at && !existing.last_message_at) {
                    // Replace with the one that has messages
                    const index = filteredChats.indexOf(existing);
                    filteredChats[index] = chat;
                    seenPairs.set(participantIds, chat);
                } else if (!chat.last_message_at && !existing.last_message_at) {
                    // Both empty, keep the newer one
                    if (chat.id > existing.id) {
                        const index = filteredChats.indexOf(existing);
                        filteredChats[index] = chat;
                        seenPairs.set(participantIds, chat);
                    }
                }
                // Otherwise keep existing (it has messages or is older)
            }
        }

        res.json({ success: true, chats: filteredChats });
    } catch (err) {
        console.error('Error fetching chats:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get or create direct chat
exports.getOrCreateDirectChat = async (req, res) => {
    const userId = req.user.id;
    const { otherUserId } = req.body;

    if (!otherUserId) {
        return res.status(400).json({ success: false, message: 'otherUserId is required' });
    }

    const client = await pool.connect();
    try {
        const isSelfChat = userId === otherUserId;

        // Check if direct chat already exists
        let existingChat;
        
        if (isSelfChat) {
            // For self-chat, find chat where user is the only participant
            existingChat = await client.query(`
                SELECT c.id 
                FROM chats c
                WHERE c.type = 'direct'
                AND c.id IN (
                    SELECT chat_id FROM chat_participants 
                    WHERE user_id = $1 AND left_at IS NULL
                )
                AND (
                    SELECT COUNT(DISTINCT user_id) FROM chat_participants 
                    WHERE chat_id = c.id AND left_at IS NULL
                ) = 1
                LIMIT 1
            `, [userId]);
        } else {
            // For regular chat, find chats where both users are participants
            existingChat = await client.query(`
                SELECT c.id 
                FROM chats c
                WHERE c.type = 'direct'
                AND c.id IN (
                    SELECT chat_id FROM chat_participants 
                    WHERE user_id = $1 AND left_at IS NULL
                )
                AND c.id IN (
                    SELECT chat_id FROM chat_participants 
                    WHERE user_id = $2 AND left_at IS NULL
                )
                -- Ensure it's exactly a 2-person chat
                AND (
                    SELECT COUNT(*) FROM chat_participants 
                    WHERE chat_id = c.id AND left_at IS NULL
                ) = 2
                LIMIT 1
            `, [userId, otherUserId]);
        }

        if (existingChat.rows.length > 0) {
            return res.json({ success: true, chatId: existingChat.rows[0].id, created: false });
        }

        // Create new direct chat
        await client.query('BEGIN');

        const chatResult = await client.query(`
            INSERT INTO chats (type, created_by)
            VALUES ('direct', $1)
            RETURNING id
        `, [userId]);

        const chatId = chatResult.rows[0].id;

        if (isSelfChat) {
            // For self-chat, add user only once
            await client.query(`
                INSERT INTO chat_participants (chat_id, user_id, role)
                VALUES ($1, $2, 'member')
            `, [chatId, userId]);
        } else {
            // For regular chat, add both users
            await client.query(`
                INSERT INTO chat_participants (chat_id, user_id, role)
                VALUES 
                    ($1, $2, 'member'),
                    ($1, $3, 'member')
            `, [chatId, userId, otherUserId]);
        }

        await client.query('COMMIT');

        res.status(201).json({ success: true, chatId, created: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating direct chat:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        client.release();
    }
};

// Create group chat
exports.createGroupChat = async (req, res) => {
    const userId = req.user.id;
    const { title, description, participantIds = [] } = req.body;

    if (!title) {
        return res.status(400).json({ success: false, message: 'Title is required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const chatResult = await client.query(`
            INSERT INTO chats (type, title, description, created_by)
            VALUES ('group', $1, $2, $3)
            RETURNING *
        `, [title, description, userId]);

        const chat = chatResult.rows[0];

        // Add creator as owner
        await client.query(`
            INSERT INTO chat_participants (chat_id, user_id, role)
            VALUES ($1, $2, 'owner')
        `, [chat.id, userId]);

        // Add other participants
        if (participantIds.length > 0) {
            const values = participantIds.map((_, i) => 
                `($1, $${i + 2}, 'member')`
            ).join(',');

            await client.query(`
                INSERT INTO chat_participants (chat_id, user_id, role)
                VALUES ${values}
            `, [chat.id, ...participantIds]);
        }

        await client.query('COMMIT');

        res.status(201).json({ success: true, chat });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating group chat:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        client.release();
    }
};

// Get chat details
exports.getChatDetails = async (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;

    try {
        // Verify user is participant
        const participantCheck = await pool.query(`
            SELECT role FROM chat_participants
            WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL
        `, [chatId, userId]);

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Get chat details
        const chatResult = await pool.query(`
            SELECT c.*, 
                json_agg(
                    json_build_object(
                        'id', u.id,
                        'username', u.username,
                        'avatar_url', u.profile_image,
                        'role', cp.role,
                        'joined_at', cp.joined_at
                    )
                ) as participants
            FROM chats c
            LEFT JOIN chat_participants cp ON c.id = cp.chat_id AND cp.left_at IS NULL
            LEFT JOIN users u ON cp.user_id = u.id
            WHERE c.id = $1
            GROUP BY c.id
        `, [chatId]);

        if (chatResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }

        res.json({ success: true, chat: chatResult.rows[0] });
    } catch (err) {
        console.error('Error fetching chat details:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update chat (title, description, avatar)
exports.updateChat = async (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { title, description, avatar_url } = req.body;

    try {
        // Verify user is admin or owner
        const participantCheck = await pool.query(`
            SELECT role FROM chat_participants
            WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL
        `, [chatId, userId]);

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const role = participantCheck.rows[0].role;
        if (role !== 'admin' && role !== 'owner') {
            return res.status(403).json({ success: false, message: 'Only admins can update chat' });
        }

        const result = await pool.query(`
            UPDATE chats
            SET title = COALESCE($2, title),
                description = COALESCE($3, description),
                avatar_url = COALESCE($4, avatar_url),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [chatId, title, description, avatar_url]);

        res.json({ success: true, chat: result.rows[0] });
    } catch (err) {
        console.error('Error updating chat:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Leave/delete chat
exports.leaveChat = async (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;

    try {
        const result = await pool.query(`
            UPDATE chat_participants
            SET left_at = NOW()
            WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL
            RETURNING *
        `, [chatId, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Not a participant' });
        }

        res.json({ success: true, message: 'Left chat successfully' });
    } catch (err) {
        console.error('Error leaving chat:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Add participants to group chat
exports.addParticipants = async (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { participantIds } = req.body;

    if (!participantIds || participantIds.length === 0) {
        return res.status(400).json({ success: false, message: 'participantIds is required' });
    }

    try {
        // Verify user is admin or owner
        const participantCheck = await pool.query(`
            SELECT role FROM chat_participants
            WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL
        `, [chatId, userId]);

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const role = participantCheck.rows[0].role;
        if (role !== 'admin' && role !== 'owner') {
            return res.status(403).json({ success: false, message: 'Only admins can add participants' });
        }

        // Verify it's a group chat
        const chatCheck = await pool.query('SELECT type FROM chats WHERE id = $1', [chatId]);
        if (chatCheck.rows[0].type !== 'group') {
            return res.status(400).json({ success: false, message: 'Can only add participants to group chats' });
        }

        const values = participantIds.map((_, i) => 
            `($1, $${i + 2}, 'member')`
        ).join(',');

        await pool.query(`
            INSERT INTO chat_participants (chat_id, user_id, role)
            VALUES ${values}
            ON CONFLICT (chat_id, user_id) DO NOTHING
        `, [chatId, ...participantIds]);

        res.json({ success: true, message: 'Participants added' });
    } catch (err) {
        console.error('Error adding participants:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Remove participant from group chat
exports.removeParticipant = async (req, res) => {
    const userId = req.user.id;
    const { chatId, participantId } = req.params;

    try {
        // Verify user is admin or owner
        const participantCheck = await pool.query(`
            SELECT role FROM chat_participants
            WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL
        `, [chatId, userId]);

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const role = participantCheck.rows[0].role;
        if (role !== 'admin' && role !== 'owner') {
            return res.status(403).json({ success: false, message: 'Only admins can remove participants' });
        }

        await pool.query(`
            UPDATE chat_participants
            SET left_at = NOW()
            WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL
        `, [chatId, participantId]);

        res.json({ success: true, message: 'Participant removed' });
    } catch (err) {
        console.error('Error removing participant:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update participant role
exports.updateParticipantRole = async (req, res) => {
    const userId = req.user.id;
    const { chatId, participantId } = req.params;
    const { role } = req.body;

    if (!['member', 'admin'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    try {
        // Verify user is owner
        const participantCheck = await pool.query(`
            SELECT role FROM chat_participants
            WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL
        `, [chatId, userId]);

        if (participantCheck.rows.length === 0 || participantCheck.rows[0].role !== 'owner') {
            return res.status(403).json({ success: false, message: 'Only owner can change roles' });
        }

        await pool.query(`
            UPDATE chat_participants
            SET role = $3
            WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL
        `, [chatId, participantId, role]);

        res.json({ success: true, message: 'Role updated' });
    } catch (err) {
        console.error('Error updating role:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update chat settings (mute, pin, hide)
exports.updateChatSettings = async (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { muted, pinned, hidden } = req.body;

    try {
        const updates = [];
        const values = [chatId, userId];
        let paramCount = 3;

        if (typeof muted === 'boolean') {
            updates.push(`muted = $${paramCount++}`);
            values.push(muted);
        }
        if (typeof pinned === 'boolean') {
            updates.push(`pinned = $${paramCount++}`);
            values.push(pinned);
        }
        if (typeof hidden === 'boolean') {
            updates.push(`hidden = $${paramCount++}`);
            values.push(hidden);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No settings to update' });
        }

        await pool.query(`
            UPDATE chat_participants
            SET ${updates.join(', ')}
            WHERE chat_id = $1 AND user_id = $2
        `, values);

        res.json({ success: true, message: 'Settings updated' });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
