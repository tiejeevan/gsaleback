-- ================================================
-- =============== ENUM DEFINITIONS ===============
-- ================================================
CREATE TYPE chat_type AS ENUM ('direct', 'group');
CREATE TYPE message_type AS ENUM ('text', 'image', 'video', 'file', 'system');
CREATE TYPE participant_role AS ENUM ('member', 'admin', 'owner');
CREATE TYPE message_status_enum AS ENUM ('sent', 'delivered', 'read');

-- ================================================
-- ================== CHATS =======================
-- ================================================
CREATE TABLE chats (
    id SERIAL PRIMARY KEY,
    type chat_type NOT NULL DEFAULT 'direct',
    title VARCHAR(255),
    description TEXT,  -- Added: useful for group chats
    avatar_url TEXT,   -- Added: group chat avatar
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    last_message_id INTEGER,
    last_message_at TIMESTAMP,  -- Added: denormalized for faster sorting
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Quick access to recent chats
CREATE INDEX idx_chats_type ON chats(type);
CREATE INDEX idx_chats_updated_at ON chats(updated_at DESC);
CREATE INDEX idx_chats_last_message_at ON chats(last_message_at DESC);  -- Added

-- ================================================
-- ============= CHAT PARTICIPANTS ================
-- ================================================
CREATE TABLE chat_participants (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role participant_role DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT NOW(),
    left_at TIMESTAMP,  -- Added: track when user left (soft delete)
    last_read_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    last_read_at TIMESTAMP,  -- Added: track when user last read
    muted BOOLEAN DEFAULT FALSE,
    pinned BOOLEAN DEFAULT FALSE,
    hidden BOOLEAN DEFAULT FALSE,
    unread_count INTEGER DEFAULT 0,  -- Added: denormalized for performance
    UNIQUE (chat_id, user_id)
);

CREATE INDEX idx_chat_participants_user ON chat_participants(user_id);
CREATE INDEX idx_chat_participants_chat ON chat_participants(chat_id);
CREATE INDEX idx_chat_participants_active ON chat_participants(user_id, left_at) WHERE left_at IS NULL;  -- Added

-- ================================================
-- ================== MESSAGES ====================
-- ================================================
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    content TEXT,
    type message_type DEFAULT 'text',
    reply_to INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    is_edited BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,  -- Added: track when deleted
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()  -- Added: track edits
);

CREATE INDEX idx_messages_chat_id ON messages(chat_id, created_at DESC);  -- Composite for pagination
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_reply_to ON messages(reply_to) WHERE reply_to IS NOT NULL;  -- Added: partial index

-- Link last_message_id (after messages table creation)
ALTER TABLE chats
ADD CONSTRAINT fk_last_message FOREIGN KEY (last_message_id)
REFERENCES messages(id) ON DELETE SET NULL;

-- ================================================
-- ============= MESSAGE STATUS ===================
-- ================================================
CREATE TABLE message_status (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status message_status_enum DEFAULT 'sent',
    created_at TIMESTAMP DEFAULT NOW(),  -- Added: track when status was set
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (message_id, user_id)
);

CREATE INDEX idx_message_status_user ON message_status(user_id);
CREATE INDEX idx_message_status_message ON message_status(message_id);  -- Added
CREATE INDEX idx_message_status_status ON message_status(message_id, status);  -- Composite

-- ================================================
-- =========== MESSAGE REACTIONS ==================
-- ================================================
CREATE TABLE message_reactions (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(32) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX idx_message_reactions_msg ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_user ON message_reactions(user_id);  -- Added

-- ================================================
-- =========== MESSAGE ATTACHMENTS ================
-- ================================================
CREATE TABLE message_attachments (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),  -- Added: original filename
    file_type VARCHAR(100),
    file_size INTEGER,
    thumbnail_url TEXT,
    width INTEGER,  -- Added: for images/videos
    height INTEGER,  -- Added: for images/videos
    duration INTEGER,  -- Added: for videos/audio (in seconds)
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_message_attachments_msg ON message_attachments(message_id);

-- ================================================
-- ============= TYPING INDICATORS ================
-- ================================================
-- Added: Track who's typing in real-time
CREATE TABLE typing_indicators (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,  -- Auto-expire after 5-10 seconds
    UNIQUE (chat_id, user_id)
);

CREATE INDEX idx_typing_indicators_chat ON typing_indicators(chat_id, expires_at);

-- ================================================
-- ================= TRIGGERS =====================
-- ================================================

-- Update chats.updated_at on new message
CREATE OR REPLACE FUNCTION update_chat_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE chats 
    SET updated_at = NOW(),
        last_message_id = NEW.id,
        last_message_at = NEW.created_at
    WHERE id = NEW.chat_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_chat_timestamp
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_chat_timestamp();

-- Update messages.updated_at on edit
CREATE OR REPLACE FUNCTION update_message_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_message_timestamp
BEFORE UPDATE ON messages
FOR EACH ROW
WHEN (OLD.content IS DISTINCT FROM NEW.content OR OLD.is_edited IS DISTINCT FROM NEW.is_edited)
EXECUTE FUNCTION update_message_timestamp();

-- Increment unread count for participants
CREATE OR REPLACE FUNCTION increment_unread_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE chat_participants
    SET unread_count = unread_count + 1
    WHERE chat_id = NEW.chat_id 
    AND user_id != NEW.sender_id
    AND left_at IS NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_unread_count
AFTER INSERT ON messages
FOR EACH ROW
WHEN (NEW.type != 'system')
EXECUTE FUNCTION increment_unread_count();

-- Clean up expired typing indicators (optional, can also be done in app)
CREATE OR REPLACE FUNCTION cleanup_expired_typing()
RETURNS void AS $$
BEGIN
    DELETE FROM typing_indicators WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- ============= HELPER VIEWS =====================
-- ================================================

-- View for user's chat list with unread counts
CREATE VIEW user_chat_list AS
SELECT 
    c.id,
    c.type,
    c.title,
    c.avatar_url,
    c.last_message_at,
    cp.user_id,
    cp.unread_count,
    cp.pinned,
    cp.muted,
    cp.hidden,
    m.content as last_message_content,
    m.type as last_message_type,
    u.username as last_message_sender
FROM chats c
JOIN chat_participants cp ON c.id = cp.chat_id
LEFT JOIN messages m ON c.last_message_id = m.id
LEFT JOIN users u ON m.sender_id = u.id
WHERE cp.left_at IS NULL;

-- ================================================
-- ============= USEFUL QUERIES ===================
-- ================================================

-- Get user's chats ordered by recent activity
-- SELECT * FROM user_chat_list 
-- WHERE user_id = $1 AND hidden = FALSE
-- ORDER BY pinned DESC, last_message_at DESC NULLS LAST;

-- Get messages for a chat with pagination
-- SELECT m.*, u.username, u.avatar_url
-- FROM messages m
-- LEFT JOIN users u ON m.sender_id = u.id
-- WHERE m.chat_id = $1 AND m.is_deleted = FALSE
-- ORDER BY m.created_at DESC
-- LIMIT $2 OFFSET $3;

-- Mark messages as read and reset unread count
-- UPDATE chat_participants
-- SET last_read_message_id = $2,
--     last_read_at = NOW(),
--     unread_count = 0
-- WHERE chat_id = $1 AND user_id = $3;

-- Get or create direct chat between two users
-- WITH existing_chat AS (
--     SELECT c.id FROM chats c
--     JOIN chat_participants cp1 ON c.id = cp1.chat_id
--     JOIN chat_participants cp2 ON c.id = cp2.chat_id
--     WHERE c.type = 'direct'
--     AND cp1.user_id = $1
--     AND cp2.user_id = $2
--     AND cp1.left_at IS NULL
--     AND cp2.left_at IS NULL
--     LIMIT 1
-- )
-- SELECT id FROM existing_chat;
