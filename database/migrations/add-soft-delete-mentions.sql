-- Migration: Add soft delete support for mentions and notifications

-- Add deleted_at column to comment_mentions table
ALTER TABLE comment_mentions 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

-- Add deleted_at column to notifications table
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

-- Add index for faster queries on non-deleted records
CREATE INDEX IF NOT EXISTS idx_comment_mentions_not_deleted 
ON comment_mentions(mentioned_user_id, is_read) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_not_deleted 
ON notifications(recipient_user_id, is_read) 
WHERE deleted_at IS NULL;

-- Add comments
COMMENT ON COLUMN comment_mentions.deleted_at IS 'Timestamp when mention was soft deleted (NULL = active)';
COMMENT ON COLUMN notifications.deleted_at IS 'Timestamp when notification was soft deleted (NULL = active)';
