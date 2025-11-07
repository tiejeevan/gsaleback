# Chat Feature API Documentation

## Database Schema Overview

### Tables

#### 1. **chats**
Main table for chat conversations (direct or group).

```sql
- id: SERIAL PRIMARY KEY
- type: chat_type ('direct', 'group')
- title: VARCHAR(255) - Group chat name
- description: TEXT - Group chat description
- avatar_url: TEXT - Group chat avatar
- created_by: INTEGER - User who created the chat
- last_message_id: INTEGER - Reference to last message
- last_message_at: TIMESTAMP - When last message was sent
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

**Indexes:**
- `idx_chats_type` - Filter by chat type
- `idx_chats_updated_at` - Sort by recent activity
- `idx_chats_last_message_at` - Sort by last message time

---

#### 2. **chat_participants**
Links users to chats with their roles and preferences.

```sql
- id: SERIAL PRIMARY KEY
- chat_id: INTEGER - Reference to chat
- user_id: INTEGER - Reference to user
- role: participant_role ('member', 'admin', 'owner')
- joined_at: TIMESTAMP
- left_at: TIMESTAMP - NULL if still active
- last_read_message_id: INTEGER - Last message user read
- last_read_at: TIMESTAMP
- muted: BOOLEAN - Chat notifications muted
- pinned: BOOLEAN - Chat pinned to top
- hidden: BOOLEAN - Chat hidden from list
- unread_count: INTEGER - Denormalized unread count
```

**Indexes:**
- `idx_chat_participants_user` - Get user's chats
- `idx_chat_participants_chat` - Get chat's participants
- `idx_chat_participants_active` - Filter active participants

**Unique Constraint:** (chat_id, user_id)

---

#### 3. **messages**
Individual messages in chats.

```sql
- id: SERIAL PRIMARY KEY
- chat_id: INTEGER - Reference to chat
- sender_id: INTEGER - User who sent message
- content: TEXT - Message content
- type: message_type ('text', 'image', 'video', 'file', 'system')
- reply_to: INTEGER - Reference to message being replied to
- is_edited: BOOLEAN
- is_deleted: BOOLEAN - Soft delete
- deleted_at: TIMESTAMP
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

**Indexes:**
- `idx_messages_chat_id` - Get messages for a chat (with pagination)
- `idx_messages_created_at` - Sort by time
- `idx_messages_reply_to` - Get message replies

---

#### 4. **message_status**
Tracks delivery and read status per user.

```sql
- id: SERIAL PRIMARY KEY
- message_id: INTEGER
- user_id: INTEGER
- status: message_status_enum ('sent', 'delivered', 'read')
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

**Indexes:**
- `idx_message_status_user` - Get user's message statuses
- `idx_message_status_message` - Get message's statuses
- `idx_message_status_status` - Filter by status

**Unique Constraint:** (message_id, user_id)

---

#### 5. **message_reactions**
Emoji reactions to messages.

```sql
- id: SERIAL PRIMARY KEY
- message_id: INTEGER
- user_id: INTEGER
- emoji: VARCHAR(32) - Emoji character
- created_at: TIMESTAMP
```

**Indexes:**
- `idx_message_reactions_msg` - Get reactions for a message
- `idx_message_reactions_user` - Get user's reactions

**Unique Constraint:** (message_id, user_id, emoji)

---

#### 6. **message_attachments**
Files, images, videos attached to messages.

```sql
- id: SERIAL PRIMARY KEY
- message_id: INTEGER
- file_url: TEXT
- file_name: VARCHAR(255)
- file_type: VARCHAR(100)
- file_size: INTEGER - In bytes
- thumbnail_url: TEXT
- width: INTEGER - For images/videos
- height: INTEGER - For images/videos
- duration: INTEGER - For videos/audio (seconds)
- created_at: TIMESTAMP
```

**Indexes:**
- `idx_message_attachments_msg` - Get attachments for a message

---

#### 7. **typing_indicators**
Real-time typing status.

```sql
- id: SERIAL PRIMARY KEY
- chat_id: INTEGER
- user_id: INTEGER
- started_at: TIMESTAMP
- expires_at: TIMESTAMP - Auto-expire after 5-10 seconds
```

**Indexes:**
- `idx_typing_indicators_chat` - Get who's typing in a chat

**Unique Constraint:** (chat_id, user_id)

---

### Enums

```sql
chat_type: 'direct' | 'group'
message_type: 'text' | 'image' | 'video' | 'file' | 'system'
participant_role: 'member' | 'admin' | 'owner'
message_status_enum: 'sent' | 'delivered' | 'read'
```

---

### Triggers

#### 1. **update_chat_timestamp**
Automatically updates `chats.updated_at`, `last_message_id`, and `last_message_at` when a new message is inserted.

#### 2. **update_message_timestamp**
Updates `messages.updated_at` when message content is edited.

#### 3. **increment_unread_count**
Increments `unread_count` for all participants (except sender) when a new non-system message is sent.

---

### Views

#### **user_chat_list**
Convenient view for getting a user's chat list with all necessary info.

```sql
SELECT * FROM user_chat_list 
WHERE user_id = $1 AND hidden = FALSE
ORDER BY pinned DESC, last_message_at DESC NULLS LAST;
```

Returns:
- Chat details (id, type, title, avatar_url)
- User-specific data (unread_count, pinned, muted, hidden)
- Last message preview (content, type, sender username)

---

## Common Query Patterns

### 1. Get User's Chat List
```javascript
const getUserChats = async (userId) => {
    const result = await pool.query(`
        SELECT * FROM user_chat_list 
        WHERE user_id = $1 AND hidden = FALSE
        ORDER BY pinned DESC, last_message_at DESC NULLS LAST
    `, [userId]);
    return result.rows;
};
```

### 2. Get Messages for a Chat (with pagination)
```javascript
const getChatMessages = async (chatId, limit = 50, offset = 0) => {
    const result = await pool.query(`
        SELECT 
            m.*,
            u.username,
            u.avatar_url,
            json_agg(
                json_build_object(
                    'id', ma.id,
                    'file_url', ma.file_url,
                    'file_name', ma.file_name,
                    'file_type', ma.file_type,
                    'file_size', ma.file_size,
                    'thumbnail_url', ma.thumbnail_url
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
            ) as reactions
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        LEFT JOIN message_attachments ma ON m.id = ma.message_id
        WHERE m.chat_id = $1 AND m.is_deleted = FALSE
        GROUP BY m.id, u.username, u.avatar_url
        ORDER BY m.created_at DESC
        LIMIT $2 OFFSET $3
    `, [chatId, limit, offset]);
    return result.rows;
};
```

### 3. Send a Message
```javascript
const sendMessage = async (chatId, senderId, content, type = 'text', replyTo = null) => {
    const result = await pool.query(`
        INSERT INTO messages (chat_id, sender_id, content, type, reply_to)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    `, [chatId, senderId, content, type, replyTo]);
    
    // Trigger automatically updates chat timestamp and unread counts
    return result.rows[0];
};
```

### 4. Mark Messages as Read
```javascript
const markAsRead = async (chatId, userId, lastMessageId) => {
    await pool.query(`
        UPDATE chat_participants
        SET last_read_message_id = $2,
            last_read_at = NOW(),
            unread_count = 0
        WHERE chat_id = $1 AND user_id = $3
    `, [chatId, lastMessageId, userId]);
    
    // Update message status to 'read'
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
};
```

### 5. Get or Create Direct Chat
```javascript
const getOrCreateDirectChat = async (userId1, userId2) => {
    // Try to find existing direct chat
    let result = await pool.query(`
        SELECT c.id FROM chats c
        JOIN chat_participants cp1 ON c.id = cp1.chat_id
        JOIN chat_participants cp2 ON c.id = cp2.chat_id
        WHERE c.type = 'direct'
        AND cp1.user_id = $1
        AND cp2.user_id = $2
        AND cp1.left_at IS NULL
        AND cp2.left_at IS NULL
        LIMIT 1
    `, [userId1, userId2]);
    
    if (result.rows.length > 0) {
        return result.rows[0].id;
    }
    
    // Create new direct chat
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const chatResult = await client.query(`
            INSERT INTO chats (type, created_by)
            VALUES ('direct', $1)
            RETURNING id
        `, [userId1]);
        
        const chatId = chatResult.rows[0].id;
        
        await client.query(`
            INSERT INTO chat_participants (chat_id, user_id, role)
            VALUES 
                ($1, $2, 'member'),
                ($1, $3, 'member')
        `, [chatId, userId1, userId2]);
        
        await client.query('COMMIT');
        return chatId;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};
```

### 6. Create Group Chat
```javascript
const createGroupChat = async (creatorId, title, description, participantIds) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const chatResult = await client.query(`
            INSERT INTO chats (type, title, description, created_by)
            VALUES ('group', $1, $2, $3)
            RETURNING id
        `, [title, description, creatorId]);
        
        const chatId = chatResult.rows[0].id;
        
        // Add creator as owner
        await client.query(`
            INSERT INTO chat_participants (chat_id, user_id, role)
            VALUES ($1, $2, 'owner')
        `, [chatId, creatorId]);
        
        // Add other participants as members
        if (participantIds.length > 0) {
            const values = participantIds.map((id, i) => 
                `($1, $${i + 2}, 'member')`
            ).join(',');
            
            await client.query(`
                INSERT INTO chat_participants (chat_id, user_id, role)
                VALUES ${values}
            `, [chatId, ...participantIds]);
        }
        
        await client.query('COMMIT');
        return chatId;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};
```

### 7. Add Reaction to Message
```javascript
const addReaction = async (messageId, userId, emoji) => {
    const result = await pool.query(`
        INSERT INTO message_reactions (message_id, user_id, emoji)
        VALUES ($1, $2, $3)
        ON CONFLICT (message_id, user_id, emoji) DO NOTHING
        RETURNING *
    `, [messageId, userId, emoji]);
    return result.rows[0];
};
```

### 8. Remove Reaction
```javascript
const removeReaction = async (messageId, userId, emoji) => {
    await pool.query(`
        DELETE FROM message_reactions
        WHERE message_id = $1 AND user_id = $2 AND emoji = $3
    `, [messageId, userId, emoji]);
};
```

### 9. Set Typing Indicator
```javascript
const setTyping = async (chatId, userId, duration = 5000) => {
    const expiresAt = new Date(Date.now() + duration);
    await pool.query(`
        INSERT INTO typing_indicators (chat_id, user_id, expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (chat_id, user_id) 
        DO UPDATE SET started_at = NOW(), expires_at = $3
    `, [chatId, userId, expiresAt]);
};
```

### 10. Get Who's Typing
```javascript
const getTypingUsers = async (chatId) => {
    const result = await pool.query(`
        SELECT u.id, u.username, u.avatar_url
        FROM typing_indicators ti
        JOIN users u ON ti.user_id = u.id
        WHERE ti.chat_id = $1 AND ti.expires_at > NOW()
    `, [chatId]);
    return result.rows;
};
```

---

## API Endpoint Structure (Recommended)

### Chat Endpoints
```
GET    /api/chats                    - Get user's chat list
POST   /api/chats/direct             - Create/get direct chat
POST   /api/chats/group              - Create group chat
GET    /api/chats/:chatId            - Get chat details
PATCH  /api/chats/:chatId            - Update chat (title, description, avatar)
DELETE /api/chats/:chatId            - Leave/delete chat
POST   /api/chats/:chatId/participants - Add participants (group only)
DELETE /api/chats/:chatId/participants/:userId - Remove participant
PATCH  /api/chats/:chatId/participants/:userId - Update participant role
```

### Message Endpoints
```
GET    /api/chats/:chatId/messages   - Get messages (paginated)
POST   /api/chats/:chatId/messages   - Send message
PATCH  /api/messages/:messageId      - Edit message
DELETE /api/messages/:messageId      - Delete message
POST   /api/messages/:messageId/reactions - Add reaction
DELETE /api/messages/:messageId/reactions/:emoji - Remove reaction
```

### User Actions
```
POST   /api/chats/:chatId/read       - Mark messages as read
PATCH  /api/chats/:chatId/settings   - Update chat settings (mute, pin, hide)
POST   /api/chats/:chatId/typing     - Set typing indicator
GET    /api/chats/:chatId/typing     - Get who's typing
```

---

## WebSocket Events (for Real-time)

### Client → Server
```javascript
// Join chat room
socket.emit('join_chat', { chatId, userId });

// Send message
socket.emit('send_message', { chatId, content, type, replyTo });

// Typing indicator
socket.emit('typing', { chatId, userId });
socket.emit('stop_typing', { chatId, userId });

// Mark as read
socket.emit('mark_read', { chatId, messageId });
```

### Server → Client
```javascript
// New message
socket.on('new_message', (message) => { ... });

// Message edited
socket.on('message_edited', (message) => { ... });

// Message deleted
socket.on('message_deleted', (messageId) => { ... });

// User typing
socket.on('user_typing', ({ userId, username }) => { ... });
socket.on('user_stop_typing', ({ userId }) => { ... });

// Message read
socket.on('message_read', ({ messageId, userId }) => { ... });

// Reaction added/removed
socket.on('reaction_added', ({ messageId, userId, emoji }) => { ... });
socket.on('reaction_removed', ({ messageId, userId, emoji }) => { ... });
```

---

## Performance Tips

1. **Pagination**: Always paginate messages (50-100 per page)
2. **Indexes**: All critical indexes are already created
3. **Denormalization**: `unread_count` and `last_message_at` are denormalized for speed
4. **Soft Deletes**: Use `is_deleted` flag instead of actual deletion
5. **Cleanup**: Periodically clean up expired typing indicators
6. **Caching**: Consider caching chat lists and recent messages in Redis

---

## Security Considerations

1. **Authorization**: Always verify user is a participant before allowing access
2. **File Uploads**: Validate file types and sizes for attachments
3. **Rate Limiting**: Implement rate limits on message sending
4. **XSS Protection**: Sanitize message content before displaying
5. **SQL Injection**: Always use parameterized queries (already done in examples)

---

## Next Steps

1. Create controllers in `controllers/chatController.js`
2. Create routes in `routes/chatRoutes.js`
3. Implement WebSocket handlers for real-time features
4. Add file upload service for attachments
5. Implement notification system for new messages
