-- Migration: Add mentions support to comments table
-- This enables @mentions functionality in nested comments

-- Add mentions column to comments table (stores array of mentioned user IDs)
ALTER TABLE comments 
ADD COLUMN IF NOT EXISTS mentions JSONB DEFAULT '[]'::jsonb;

-- Add index for faster mention queries
CREATE INDEX IF NOT EXISTS idx_comments_mentions ON comments USING GIN (mentions);

-- Add comment to track the change
COMMENT ON COLUMN comments.mentions IS 'Array of user IDs mentioned in this comment using @username syntax';

-- Create a mentions table for tracking all mentions (optional but recommended for analytics)
CREATE TABLE IF NOT EXISTS comment_mentions (
    id SERIAL PRIMARY KEY,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    mentioned_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mentioner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT false,
    UNIQUE(comment_id, mentioned_user_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_comment_mentions_mentioned_user ON comment_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_comment_mentions_comment ON comment_mentions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_mentions_unread ON comment_mentions(mentioned_user_id, is_read) WHERE is_read = false;

-- Add comment
COMMENT ON TABLE comment_mentions IS 'Tracks all @mentions in comments for notifications and analytics';
