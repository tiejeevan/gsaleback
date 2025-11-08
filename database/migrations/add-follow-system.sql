-- ================================================
-- ============= USER FOLLOWS SYSTEM ==============
-- ================================================
-- Migration: Add follow/follower functionality
-- Date: 2024
-- Backwards Compatible: YES (only adds new tables/columns)
-- ================================================

-- Create user_follows table to track who follows whom
CREATE TABLE IF NOT EXISTS user_follows (
    id SERIAL PRIMARY KEY,
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Prevent duplicate follows
    UNIQUE(follower_id, following_id),
    
    -- Prevent self-follows
    CHECK (follower_id != following_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_created ON user_follows(created_at DESC);

-- Add follower/following counts to users table (optional, for performance)
-- These are backwards compatible - will be NULL for existing users until calculated
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;

-- Create function to update follower counts automatically
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        -- Increment following count for follower
        UPDATE users SET following_count = following_count + 1 WHERE id = NEW.follower_id;
        -- Increment follower count for the one being followed
        UPDATE users SET follower_count = follower_count + 1 WHERE id = NEW.following_id;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        -- Decrement following count for follower
        UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
        -- Decrement follower count for the one being unfollowed
        UPDATE users SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = OLD.following_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update counts
DROP TRIGGER IF EXISTS trigger_update_follow_counts ON user_follows;
CREATE TRIGGER trigger_update_follow_counts
    AFTER INSERT OR DELETE ON user_follows
    FOR EACH ROW
    EXECUTE FUNCTION update_follow_counts();

-- Initialize follower/following counts for existing users
-- This is safe to run multiple times
UPDATE users SET 
    follower_count = (
        SELECT COUNT(*) FROM user_follows WHERE following_id = users.id
    ),
    following_count = (
        SELECT COUNT(*) FROM user_follows WHERE follower_id = users.id
    )
WHERE follower_count IS NULL OR following_count IS NULL;

-- Create view for easy follow relationship queries
CREATE OR REPLACE VIEW user_follow_details AS
SELECT 
    uf.id,
    uf.follower_id,
    uf.following_id,
    uf.created_at,
    u1.username as follower_username,
    u1.display_name as follower_display_name,
    u1.profile_image as follower_profile_image,
    u2.username as following_username,
    u2.display_name as following_display_name,
    u2.profile_image as following_profile_image
FROM user_follows uf
JOIN users u1 ON uf.follower_id = u1.id
JOIN users u2 ON uf.following_id = u2.id;

-- Add follow notifications support (extends existing notifications table)
-- No changes needed to notifications table - it already supports custom types

-- Create indexes on notifications for follow-related queries
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_type ON notifications(recipient_user_id, type);

-- ================================================
-- Success message
-- ================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Follow system migration completed successfully!';
    RAISE NOTICE '📊 Tables created: user_follows';
    RAISE NOTICE '📊 Columns added: users.follower_count, users.following_count';
    RAISE NOTICE '🔧 Triggers created: trigger_update_follow_counts';
    RAISE NOTICE '👁️  Views created: user_follow_details';
    RAISE NOTICE '✨ System is backwards compatible - existing data preserved';
END $$;
