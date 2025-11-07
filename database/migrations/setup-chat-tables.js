const pool = require('./db');

async function setupChatTables() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Check if users table exists
        const usersCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'users'
            );
        `);
        
        if (!usersCheck.rows[0].exists) {
            console.log('⚠️  Warning: users table does not exist. Creating basic users table...');
            await client.query(`
                CREATE TABLE users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    avatar_url TEXT,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            `);
        }
        
        // Create enums
        console.log('Creating enums...');
        await client.query(`
            DO $$ BEGIN
                CREATE TYPE chat_type AS ENUM ('direct', 'group');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);
        
        await client.query(`
            DO $$ BEGIN
                CREATE TYPE message_type AS ENUM ('text', 'image', 'video', 'file', 'system');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);
        
        await client.query(`
            DO $$ BEGIN
                CREATE TYPE participant_role AS ENUM ('member', 'admin', 'owner');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);
        
        await client.query(`
            DO $$ BEGIN
                CREATE TYPE message_status_enum AS ENUM ('sent', 'delivered', 'read');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);
        
        // Create chats table
        console.log('Creating chats table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS chats (
                id SERIAL PRIMARY KEY,
                type chat_type NOT NULL DEFAULT 'direct',
                title VARCHAR(255),
                description TEXT,
                avatar_url TEXT,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                last_message_id INTEGER,
                last_message_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        
        // Create messages table (without FK to chats.last_message_id yet)
        console.log('Creating messages table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
                sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                content TEXT,
                type message_type DEFAULT 'text',
                reply_to INTEGER,
                is_edited BOOLEAN DEFAULT FALSE,
                is_deleted BOOLEAN DEFAULT FALSE,
                deleted_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        
        // Add FK for reply_to
        await client.query(`
            DO $$ BEGIN
                ALTER TABLE messages
                ADD CONSTRAINT fk_reply_to FOREIGN KEY (reply_to)
                REFERENCES messages(id) ON DELETE SET NULL;
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);
        
        // Add FK for chats.last_message_id
        await client.query(`
            DO $$ BEGIN
                ALTER TABLE chats
                ADD CONSTRAINT fk_last_message FOREIGN KEY (last_message_id)
                REFERENCES messages(id) ON DELETE SET NULL;
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);
        
        // Create chat_participants table
        console.log('Creating chat_participants table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS chat_participants (
                id SERIAL PRIMARY KEY,
                chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role participant_role DEFAULT 'member',
                joined_at TIMESTAMP DEFAULT NOW(),
                left_at TIMESTAMP,
                last_read_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
                last_read_at TIMESTAMP,
                muted BOOLEAN DEFAULT FALSE,
                pinned BOOLEAN DEFAULT FALSE,
                hidden BOOLEAN DEFAULT FALSE,
                unread_count INTEGER DEFAULT 0,
                UNIQUE (chat_id, user_id)
            );
        `);
        
        // Create message_status table
        console.log('Creating message_status table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS message_status (
                id SERIAL PRIMARY KEY,
                message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status message_status_enum DEFAULT 'sent',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (message_id, user_id)
            );
        `);
        
        // Create message_reactions table
        console.log('Creating message_reactions table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS message_reactions (
                id SERIAL PRIMARY KEY,
                message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                emoji VARCHAR(32) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (message_id, user_id, emoji)
            );
        `);
        
        // Create message_attachments table
        console.log('Creating message_attachments table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS message_attachments (
                id SERIAL PRIMARY KEY,
                message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
                file_url TEXT NOT NULL,
                file_name VARCHAR(255),
                file_type VARCHAR(100),
                file_size INTEGER,
                thumbnail_url TEXT,
                width INTEGER,
                height INTEGER,
                duration INTEGER,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        
        // Create typing_indicators table
        console.log('Creating typing_indicators table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS typing_indicators (
                id SERIAL PRIMARY KEY,
                chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                started_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP NOT NULL,
                UNIQUE (chat_id, user_id)
            );
        `);
        
        // Create indexes
        console.log('Creating indexes...');
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_chats_type ON chats(type)',
            'CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_chats_last_message_at ON chats(last_message_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_chat_participants_chat ON chat_participants(chat_id)',
            'CREATE INDEX IF NOT EXISTS idx_chat_participants_active ON chat_participants(user_id, left_at) WHERE left_at IS NULL',
            'CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id, created_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to) WHERE reply_to IS NOT NULL',
            'CREATE INDEX IF NOT EXISTS idx_message_status_user ON message_status(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_message_status_message ON message_status(message_id)',
            'CREATE INDEX IF NOT EXISTS idx_message_status_status ON message_status(message_id, status)',
            'CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions(message_id)',
            'CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON message_reactions(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_message_attachments_msg ON message_attachments(message_id)',
            'CREATE INDEX IF NOT EXISTS idx_typing_indicators_chat ON typing_indicators(chat_id, expires_at)'
        ];
        
        for (const index of indexes) {
            await client.query(index);
        }
        
        // Create triggers
        console.log('Creating triggers...');
        
        // Update chat timestamp trigger
        await client.query(`
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
        `);
        
        await client.query(`
            DROP TRIGGER IF EXISTS trigger_update_chat_timestamp ON messages;
            CREATE TRIGGER trigger_update_chat_timestamp
            AFTER INSERT ON messages
            FOR EACH ROW
            EXECUTE FUNCTION update_chat_timestamp();
        `);
        
        // Update message timestamp trigger
        await client.query(`
            CREATE OR REPLACE FUNCTION update_message_timestamp()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        await client.query(`
            DROP TRIGGER IF EXISTS trigger_update_message_timestamp ON messages;
            CREATE TRIGGER trigger_update_message_timestamp
            BEFORE UPDATE ON messages
            FOR EACH ROW
            WHEN (OLD.content IS DISTINCT FROM NEW.content OR OLD.is_edited IS DISTINCT FROM NEW.is_edited)
            EXECUTE FUNCTION update_message_timestamp();
        `);
        
        // Increment unread count trigger
        await client.query(`
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
        `);
        
        await client.query(`
            DROP TRIGGER IF EXISTS trigger_increment_unread_count ON messages;
            CREATE TRIGGER trigger_increment_unread_count
            AFTER INSERT ON messages
            FOR EACH ROW
            WHEN (NEW.type != 'system')
            EXECUTE FUNCTION increment_unread_count();
        `);
        
        // Create view
        console.log('Creating views...');
        await client.query(`
            CREATE OR REPLACE VIEW user_chat_list AS
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
        `);
        
        await client.query('COMMIT');
        console.log('✅ Chat tables created successfully!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error creating tables:', error.message);
        throw error;
    } finally {
        client.release();
        process.exit(0);
    }
}

setupChatTables();
