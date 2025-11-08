// services/followService.js
const pool = require('../db');

/**
 * Follow a user
 */
exports.followUser = async (followerId, followingId) => {
  // Prevent self-follow
  if (followerId === followingId) {
    throw new Error('Cannot follow yourself');
  }

  // Check if already following
  const existingFollow = await pool.query(
    'SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2',
    [followerId, followingId]
  );

  if (existingFollow.rows.length > 0) {
    throw new Error('Already following this user');
  }

  // Check if the user to follow exists and is active
  const userCheck = await pool.query(
    'SELECT id FROM users WHERE id = $1 AND is_active = true AND deleted_at IS NULL',
    [followingId]
  );

  if (userCheck.rows.length === 0) {
    throw new Error('User not found or inactive');
  }

  // Create follow relationship
  const { rows } = await pool.query(
    `INSERT INTO user_follows (follower_id, following_id)
     VALUES ($1, $2)
     RETURNING id, follower_id, following_id, created_at`,
    [followerId, followingId]
  );

  return rows[0];
};

/**
 * Unfollow a user
 */
exports.unfollowUser = async (followerId, followingId) => {
  const { rows } = await pool.query(
    `DELETE FROM user_follows 
     WHERE follower_id = $1 AND following_id = $2
     RETURNING id`,
    [followerId, followingId]
  );

  if (rows.length === 0) {
    throw new Error('Not following this user');
  }

  return { success: true };
};

/**
 * Check if user A follows user B
 */
exports.isFollowing = async (followerId, followingId) => {
  const { rows } = await pool.query(
    'SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2',
    [followerId, followingId]
  );

  return rows.length > 0;
};

/**
 * Get followers of a user (people who follow them)
 */
exports.getFollowers = async (userId, limit = 50, offset = 0) => {
  const { rows } = await pool.query(
    `SELECT 
      uf.id as follow_id,
      uf.created_at as followed_at,
      u.id,
      u.username,
      u.display_name,
      u.profile_image,
      u.bio,
      u.is_verified,
      u.follower_count,
      u.following_count
     FROM user_follows uf
     JOIN users u ON uf.follower_id = u.id
     WHERE uf.following_id = $1 
       AND u.is_active = true 
       AND u.deleted_at IS NULL
     ORDER BY uf.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) as total
     FROM user_follows uf
     JOIN users u ON uf.follower_id = u.id
     WHERE uf.following_id = $1 
       AND u.is_active = true 
       AND u.deleted_at IS NULL`,
    [userId]
  );

  return {
    followers: rows,
    total: parseInt(countResult.rows[0].total),
    limit,
    offset,
  };
};

/**
 * Get following list (people the user follows)
 */
exports.getFollowing = async (userId, limit = 50, offset = 0) => {
  const { rows } = await pool.query(
    `SELECT 
      uf.id as follow_id,
      uf.created_at as followed_at,
      u.id,
      u.username,
      u.display_name,
      u.profile_image,
      u.bio,
      u.is_verified,
      u.follower_count,
      u.following_count
     FROM user_follows uf
     JOIN users u ON uf.following_id = u.id
     WHERE uf.follower_id = $1 
       AND u.is_active = true 
       AND u.deleted_at IS NULL
     ORDER BY uf.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) as total
     FROM user_follows uf
     JOIN users u ON uf.following_id = u.id
     WHERE uf.follower_id = $1 
       AND u.is_active = true 
       AND u.deleted_at IS NULL`,
    [userId]
  );

  return {
    following: rows,
    total: parseInt(countResult.rows[0].total),
    limit,
    offset,
  };
};

/**
 * Get follow stats for a user
 */
exports.getFollowStats = async (userId) => {
  const { rows } = await pool.query(
    `SELECT 
      follower_count,
      following_count
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (rows.length === 0) {
    return { follower_count: 0, following_count: 0 };
  }

  return rows[0];
};

/**
 * Get mutual follows (users who follow each other)
 */
exports.getMutualFollows = async (userId, limit = 50, offset = 0) => {
  const { rows } = await pool.query(
    `SELECT 
      u.id,
      u.username,
      u.display_name,
      u.profile_image,
      u.bio,
      u.is_verified,
      u.follower_count,
      u.following_count
     FROM users u
     WHERE u.id IN (
       SELECT uf1.following_id
       FROM user_follows uf1
       WHERE uf1.follower_id = $1
       AND EXISTS (
         SELECT 1 FROM user_follows uf2
         WHERE uf2.follower_id = uf1.following_id
         AND uf2.following_id = $1
       )
     )
     AND u.is_active = true 
     AND u.deleted_at IS NULL
     ORDER BY u.username
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return rows;
};

/**
 * Get follow suggestions (users not followed yet)
 */
exports.getFollowSuggestions = async (userId, limit = 10) => {
  const { rows } = await pool.query(
    `SELECT 
      u.id,
      u.username,
      u.display_name,
      u.profile_image,
      u.bio,
      u.is_verified,
      u.follower_count,
      u.following_count
     FROM users u
     WHERE u.id != $1
       AND u.is_active = true 
       AND u.deleted_at IS NULL
       AND u.id NOT IN (
         SELECT following_id 
         FROM user_follows 
         WHERE follower_id = $1
       )
     ORDER BY u.follower_count DESC, u.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return rows;
};

/**
 * Batch check if current user follows multiple users
 */
exports.checkMultipleFollows = async (followerId, userIds) => {
  if (!userIds || userIds.length === 0) {
    return {};
  }

  const { rows } = await pool.query(
    `SELECT following_id, true as is_following
     FROM user_follows
     WHERE follower_id = $1 AND following_id = ANY($2)`,
    [followerId, userIds]
  );

  // Convert to object map
  const followMap = {};
  userIds.forEach(id => {
    followMap[id] = false;
  });
  rows.forEach(row => {
    followMap[row.following_id] = true;
  });

  return followMap;
};

/**
 * Remove a follower (block them from following you)
 */
exports.removeFollower = async (userId, followerId) => {
  const { rows } = await pool.query(
    `DELETE FROM user_follows 
     WHERE follower_id = $1 AND following_id = $2
     RETURNING id`,
    [followerId, userId]
  );

  if (rows.length === 0) {
    throw new Error('This user is not following you');
  }

  return { success: true };
};
