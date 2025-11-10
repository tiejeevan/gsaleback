const pool = require('../db');

// Log admin action
const logAdminAction = async (adminId, targetUserId, actionType, reason, metadata = {}) => {
    try {
        await pool.query(
            `INSERT INTO admin_actions (admin_id, target_user_id, action_type, reason, metadata)
             VALUES ($1, $2, $3, $4, $5)`,
            [adminId, targetUserId, actionType, reason, JSON.stringify(metadata)]
        );
    } catch (err) {
        console.error('Error logging admin action:', err.message);
    }
};

// Get all users with pagination and filters
exports.getAllUsers = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            search = '', 
            status = '', 
            role = '',
            includeDeleted = 'false'
        } = req.query;

        const offset = (page - 1) * limit;
        let whereConditions = [];
        let params = [];
        let paramCount = 1;

        // Search filter
        if (search) {
            whereConditions.push(`(username ILIKE $${paramCount} OR email ILIKE $${paramCount} OR first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount})`);
            params.push(`%${search}%`);
            paramCount++;
        }

        // Status filter
        if (status) {
            whereConditions.push(`status = $${paramCount}`);
            params.push(status);
            paramCount++;
        }

        // Role filter
        if (role) {
            whereConditions.push(`role = $${paramCount}`);
            params.push(role);
            paramCount++;
        }

        // Include deleted filter
        if (includeDeleted === 'false') {
            whereConditions.push('is_deleted = FALSE');
        }

        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM users ${whereClause}`;
        const countResult = await pool.query(countQuery, params);
        const totalUsers = parseInt(countResult.rows[0].count);

        // Get users
        params.push(limit, offset);
        const usersQuery = `
            SELECT 
                id, first_name, last_name, username, email, role, status,
                bio, avatar_url, created_at, updated_at,
                is_deleted, deleted_at, deleted_by,
                muted_at, muted_by, muted_reason,
                suspended_at, suspended_by, suspended_reason,
                deactivated_at
            FROM users
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;

        const usersResult = await pool.query(usersQuery, params);

        res.json({
            users: usersResult.rows,
            pagination: {
                total: totalUsers,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(totalUsers / limit)
            }
        });

    } catch (err) {
        console.error('Error fetching users:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// Get admin dashboard stats
exports.getAdminStats = async (req, res) => {
    try {
        const statsResult = await pool.query('SELECT * FROM admin_stats');
        const stats = statsResult.rows[0];

        // Get recent signups (last 7 days)
        const recentSignupsResult = await pool.query(`
            SELECT COUNT(*) as count
            FROM users
            WHERE created_at >= NOW() - INTERVAL '7 days'
            AND is_deleted = FALSE
        `);

        // Get recent admin actions
        const recentActionsResult = await pool.query(`
            SELECT COUNT(*) as count
            FROM admin_actions
            WHERE created_at >= NOW() - INTERVAL '7 days'
        `);

        res.json({
            ...stats,
            recent_signups: parseInt(recentSignupsResult.rows[0].count),
            recent_admin_actions: parseInt(recentActionsResult.rows[0].count)
        });

    } catch (err) {
        console.error('Error fetching admin stats:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// Get single user details
exports.getUserDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const userResult = await pool.query(`
            SELECT 
                id, first_name, last_name, username, email, role, status,
                bio, avatar_url, created_at, updated_at,
                is_deleted, deleted_at, deleted_by,
                muted_at, muted_by, muted_reason,
                suspended_at, suspended_by, suspended_reason,
                deactivated_at
            FROM users
            WHERE id = $1
        `, [id]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get user's posts count
        const postsCount = await pool.query(
            'SELECT COUNT(*) FROM posts WHERE user_id = $1 AND is_deleted = FALSE',
            [id]
        );

        // Get user's comments count
        const commentsCount = await pool.query(
            'SELECT COUNT(*) FROM comments WHERE user_id = $1 AND is_deleted = FALSE',
            [id]
        );

        // Get admin actions on this user
        const actionsResult = await pool.query(`
            SELECT 
                aa.*,
                u.username as admin_username
            FROM admin_actions aa
            LEFT JOIN users u ON aa.admin_id = u.id
            WHERE aa.target_user_id = $1
            ORDER BY aa.created_at DESC
            LIMIT 10
        `, [id]);

        res.json({
            user: userResult.rows[0],
            stats: {
                posts_count: parseInt(postsCount.rows[0].count),
                comments_count: parseInt(commentsCount.rows[0].count)
            },
            recent_actions: actionsResult.rows
        });

    } catch (err) {
        console.error('Error fetching user details:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// Update user
exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { first_name, last_name, email, bio, username, role, password } = req.body;
        const adminId = req.user.id;

        // Build dynamic update query
        let updateFields = [];
        let params = [];
        let paramCount = 1;
        let updatedFieldsLog = {};

        if (first_name !== undefined) {
            updateFields.push(`first_name = $${paramCount}`);
            params.push(first_name);
            updatedFieldsLog.first_name = first_name;
            paramCount++;
        }

        if (last_name !== undefined) {
            updateFields.push(`last_name = $${paramCount}`);
            params.push(last_name);
            updatedFieldsLog.last_name = last_name;
            paramCount++;
        }

        if (email !== undefined) {
            updateFields.push(`email = $${paramCount}`);
            params.push(email);
            updatedFieldsLog.email = email;
            paramCount++;
        }

        if (bio !== undefined) {
            updateFields.push(`bio = $${paramCount}`);
            params.push(bio);
            updatedFieldsLog.bio = bio;
            paramCount++;
        }

        if (username !== undefined) {
            updateFields.push(`username = $${paramCount}`);
            params.push(username);
            updatedFieldsLog.username = username;
            paramCount++;
        }

        if (role !== undefined && (role === 'user' || role === 'admin')) {
            updateFields.push(`role = $${paramCount}`);
            params.push(role);
            updatedFieldsLog.role = role;
            paramCount++;
        }

        // Handle password update separately
        if (password !== undefined && password.trim() !== '') {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash(password, 10);
            updateFields.push(`password = $${paramCount}`);
            params.push(hashedPassword);
            updatedFieldsLog.password = '***CHANGED***';
            paramCount++;
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        // Add updated_at
        updateFields.push('updated_at = NOW()');

        // Add user id as last parameter
        params.push(id);

        const updateQuery = `
            UPDATE users
            SET ${updateFields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING id, first_name, last_name, username, email, bio, role, status
        `;

        const updateResult = await pool.query(updateQuery, params);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        await logAdminAction(adminId, id, 'update_user', 'User profile updated by admin', {
            updated_fields: updatedFieldsLog
        });

        res.json({ 
            message: 'User updated successfully',
            user: updateResult.rows[0] 
        });

    } catch (err) {
        console.error('Error updating user:', err.message);
        if (err.code === '23505') { // Unique constraint violation
            return res.status(400).json({ error: 'Username or email already exists' });
        }
        res.status(500).json({ error: 'Server error' });
    }
};

// Mute user
exports.muteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user.id;

        const updateResult = await pool.query(`
            UPDATE users
            SET 
                status = 'muted',
                muted_at = NOW(),
                muted_by = $1,
                muted_reason = $2,
                updated_at = NOW()
            WHERE id = $3 AND is_deleted = FALSE
            RETURNING id, username, status
        `, [adminId, reason, id]);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        await logAdminAction(adminId, id, 'mute_user', reason);

        res.json({ 
            message: 'User muted successfully',
            user: updateResult.rows[0]
        });

    } catch (err) {
        console.error('Error muting user:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// Unmute user
exports.unmuteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;

        const updateResult = await pool.query(`
            UPDATE users
            SET 
                status = 'active',
                muted_at = NULL,
                muted_by = NULL,
                muted_reason = NULL,
                updated_at = NOW()
            WHERE id = $1 AND is_deleted = FALSE
            RETURNING id, username, status
        `, [id]);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        await logAdminAction(adminId, id, 'unmute_user', 'User unmuted');

        res.json({ 
            message: 'User unmuted successfully',
            user: updateResult.rows[0]
        });

    } catch (err) {
        console.error('Error unmuting user:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// Suspend user
exports.suspendUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user.id;

        const updateResult = await pool.query(`
            UPDATE users
            SET 
                status = 'suspended',
                suspended_at = NOW(),
                suspended_by = $1,
                suspended_reason = $2,
                updated_at = NOW()
            WHERE id = $3 AND is_deleted = FALSE
            RETURNING id, username, status
        `, [adminId, reason, id]);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        await logAdminAction(adminId, id, 'suspend_user', reason);

        res.json({ 
            message: 'User suspended successfully',
            user: updateResult.rows[0]
        });

    } catch (err) {
        console.error('Error suspending user:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// Unsuspend user
exports.unsuspendUser = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;

        const updateResult = await pool.query(`
            UPDATE users
            SET 
                status = 'active',
                suspended_at = NULL,
                suspended_by = NULL,
                suspended_reason = NULL,
                updated_at = NOW()
            WHERE id = $1 AND is_deleted = FALSE
            RETURNING id, username, status
        `, [id]);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        await logAdminAction(adminId, id, 'unsuspend_user', 'User unsuspended');

        res.json({ 
            message: 'User unsuspended successfully',
            user: updateResult.rows[0]
        });

    } catch (err) {
        console.error('Error unsuspending user:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// Soft delete user
exports.softDeleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user.id;

        const updateResult = await pool.query(`
            UPDATE users
            SET 
                is_deleted = TRUE,
                deleted_at = NOW(),
                deleted_by = $1,
                updated_at = NOW()
            WHERE id = $2 AND is_deleted = FALSE
            RETURNING id, username, is_deleted
        `, [adminId, id]);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found or already deleted' });
        }

        await logAdminAction(adminId, id, 'soft_delete_user', reason);

        res.json({ 
            message: 'User deleted successfully',
            user: updateResult.rows[0]
        });

    } catch (err) {
        console.error('Error deleting user:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// Restore deleted user
exports.restoreUser = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;

        const updateResult = await pool.query(`
            UPDATE users
            SET 
                is_deleted = FALSE,
                deleted_at = NULL,
                deleted_by = NULL,
                status = 'active',
                updated_at = NOW()
            WHERE id = $1 AND is_deleted = TRUE
            RETURNING id, username, is_deleted, status
        `, [id]);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found or not deleted' });
        }

        await logAdminAction(adminId, id, 'restore_user', 'User restored from deletion');

        res.json({ 
            message: 'User restored successfully',
            user: updateResult.rows[0]
        });

    } catch (err) {
        console.error('Error restoring user:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// Permanently delete user (hard delete)
exports.permanentDeleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user.id;

        // Log before deletion
        await logAdminAction(adminId, id, 'permanent_delete_user', reason);

        // Delete user (cascade will handle related records)
        const deleteResult = await pool.query(
            'DELETE FROM users WHERE id = $1 RETURNING username',
            [id]
        );

        if (deleteResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ 
            message: 'User permanently deleted',
            username: deleteResult.rows[0].username
        });

    } catch (err) {
        console.error('Error permanently deleting user:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// Get admin action logs
exports.getAdminLogs = async (req, res) => {
    try {
        const { page = 1, limit = 50, adminId, targetUserId, actionType } = req.query;
        const offset = (page - 1) * limit;

        let whereConditions = [];
        let params = [];
        let paramCount = 1;

        if (adminId) {
            whereConditions.push(`aa.admin_id = $${paramCount}`);
            params.push(adminId);
            paramCount++;
        }

        if (targetUserId) {
            whereConditions.push(`aa.target_user_id = $${paramCount}`);
            params.push(targetUserId);
            paramCount++;
        }

        if (actionType) {
            whereConditions.push(`aa.action_type = $${paramCount}`);
            params.push(actionType);
            paramCount++;
        }

        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM admin_actions aa ${whereClause}`;
        const countResult = await pool.query(countQuery, params);
        const totalLogs = parseInt(countResult.rows[0].count);

        // Get logs
        params.push(limit, offset);
        const logsQuery = `
            SELECT 
                aa.*,
                u1.username as admin_username,
                u2.username as target_username
            FROM admin_actions aa
            LEFT JOIN users u1 ON aa.admin_id = u1.id
            LEFT JOIN users u2 ON aa.target_user_id = u2.id
            ${whereClause}
            ORDER BY aa.created_at DESC
            LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;

        const logsResult = await pool.query(logsQuery, params);

        res.json({
            logs: logsResult.rows,
            pagination: {
                total: totalLogs,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(totalLogs / limit)
            }
        });

    } catch (err) {
        console.error('Error fetching admin logs:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};
