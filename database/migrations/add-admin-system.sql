-- Add admin system to users table
-- This migration adds role, status, and soft delete functionality

-- Add role column (default is 'user', admin must be set manually in DB)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin'));

-- Add status column for account management
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'muted', 'deactivated', 'suspended'));

-- Add soft delete columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Add admin action tracking columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS muted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS muted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS muted_reason TEXT,
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS suspended_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP;

-- Add bio and avatar if not exists
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create admin_actions table for audit trail
CREATE TABLE IF NOT EXISTS admin_actions (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_is_deleted ON users(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON admin_actions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at DESC);

-- Create view for active users (not deleted)
CREATE OR REPLACE VIEW active_users AS
SELECT 
    id, first_name, last_name, username, email, role, status, 
    bio, avatar_url, created_at, updated_at,
    muted_at, muted_by, suspended_at, suspended_by
FROM users
WHERE is_deleted = FALSE;

-- Create view for admin dashboard stats
CREATE OR REPLACE VIEW admin_stats AS
SELECT 
    COUNT(*) FILTER (WHERE is_deleted = FALSE) as total_users,
    COUNT(*) FILTER (WHERE status = 'active' AND is_deleted = FALSE) as active_users,
    COUNT(*) FILTER (WHERE status = 'muted' AND is_deleted = FALSE) as muted_users,
    COUNT(*) FILTER (WHERE status = 'suspended' AND is_deleted = FALSE) as suspended_users,
    COUNT(*) FILTER (WHERE status = 'deactivated' AND is_deleted = FALSE) as deactivated_users,
    COUNT(*) FILTER (WHERE is_deleted = TRUE) as deleted_users,
    COUNT(*) FILTER (WHERE role = 'admin' AND is_deleted = FALSE) as admin_count
FROM users;
