// controllers/followController.js
const followService = require('../services/followService');
const pool = require('../db');

/**
 * Follow a user
 * POST /api/follows/:userId
 */
exports.followUser = async (req, res) => {
  try {
    const followerId = req.user.id; // Current logged-in user
    const followingId = parseInt(req.params.userId);

    if (isNaN(followingId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid user ID' 
      });
    }

    const result = await followService.followUser(followerId, followingId);

    // Create notification for the followed user
    try {
      const notificationResult = await pool.query(
        `INSERT INTO notifications (recipient_user_id, actor_user_id, type, payload)
         VALUES ($1, $2, $3, $4)
         RETURNING id, recipient_user_id, actor_user_id, type, payload, created_at`,
        [
          followingId,
          followerId,
          'follow',
          JSON.stringify({
            message: 'started following you',
            follower_id: followerId,
          }),
        ]
      );

      // Emit real-time notification via Socket.IO
      const io = req.app.get('io');
      if (io && notificationResult.rows[0]) {
        const notification = notificationResult.rows[0];
        io.to(`user_${followingId}`).emit('notification:new', {
          id: notification.id,
          notificationId: notification.id,
          actor: followerId,
          actor_user_id: followerId,
          recipient: followingId,
          recipient_user_id: followingId,
          type: 'follow',
          payload: notification.payload,
          created_at: notification.created_at,
          is_read: false,
        });
      }
    } catch (notifErr) {
      console.error('Failed to create follow notification:', notifErr);
      // Don't fail the request if notification fails
    }

    res.status(201).json({
      success: true,
      message: 'Successfully followed user',
      data: result,
    });
  } catch (err) {
    console.error('Error following user:', err);
    
    if (err.message === 'Cannot follow yourself') {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err.message === 'Already following this user') {
      return res.status(409).json({ success: false, message: err.message });
    }
    if (err.message === 'User not found or inactive') {
      return res.status(404).json({ success: false, message: err.message });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to follow user' 
    });
  }
};

/**
 * Unfollow a user
 * DELETE /api/follows/:userId
 */
exports.unfollowUser = async (req, res) => {
  try {
    const followerId = req.user.id;
    const followingId = parseInt(req.params.userId);

    if (isNaN(followingId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid user ID' 
      });
    }

    await followService.unfollowUser(followerId, followingId);

    res.json({
      success: true,
      message: 'Successfully unfollowed user',
    });
  } catch (err) {
    console.error('Error unfollowing user:', err);
    
    if (err.message === 'Not following this user') {
      return res.status(404).json({ success: false, message: err.message });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to unfollow user' 
    });
  }
};

/**
 * Check if current user follows a specific user
 * GET /api/follows/:userId/status
 */
exports.checkFollowStatus = async (req, res) => {
  try {
    const followerId = req.user.id;
    const followingId = parseInt(req.params.userId);

    if (isNaN(followingId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid user ID' 
      });
    }

    const isFollowing = await followService.isFollowing(followerId, followingId);

    res.json({
      success: true,
      data: {
        is_following: isFollowing,
        follower_id: followerId,
        following_id: followingId,
      },
    });
  } catch (err) {
    console.error('Error checking follow status:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to check follow status' 
    });
  }
};

/**
 * Get followers of a user
 * GET /api/follows/:userId/followers
 */
exports.getFollowers = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    if (isNaN(userId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid user ID' 
      });
    }

    const result = await followService.getFollowers(userId, limit, offset);

    // If current user is logged in, check which followers they follow back
    if (req.user) {
      const followerIds = result.followers.map(f => f.id);
      if (followerIds.length > 0) {
        const followMap = await followService.checkMultipleFollows(req.user.id, followerIds);
        result.followers = result.followers.map(follower => ({
          ...follower,
          is_followed_by_current_user: followMap[follower.id] || false,
        }));
      }
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('Error getting followers:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get followers' 
    });
  }
};

/**
 * Get following list of a user
 * GET /api/follows/:userId/following
 */
exports.getFollowing = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    if (isNaN(userId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid user ID' 
      });
    }

    const result = await followService.getFollowing(userId, limit, offset);

    // If current user is logged in, check which users they also follow
    if (req.user) {
      const followingIds = result.following.map(f => f.id);
      if (followingIds.length > 0) {
        const followMap = await followService.checkMultipleFollows(req.user.id, followingIds);
        result.following = result.following.map(user => ({
          ...user,
          is_followed_by_current_user: followMap[user.id] || false,
        }));
      }
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('Error getting following:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get following list' 
    });
  }
};

/**
 * Get follow stats for a user
 * GET /api/follows/:userId/stats
 */
exports.getFollowStats = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid user ID' 
      });
    }

    const stats = await followService.getFollowStats(userId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error('Error getting follow stats:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get follow stats' 
    });
  }
};

/**
 * Get mutual follows (friends)
 * GET /api/follows/mutual
 */
exports.getMutualFollows = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const mutualFollows = await followService.getMutualFollows(userId, limit, offset);

    res.json({
      success: true,
      data: {
        mutual_follows: mutualFollows,
        total: mutualFollows.length,
      },
    });
  } catch (err) {
    console.error('Error getting mutual follows:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get mutual follows' 
    });
  }
};

/**
 * Get follow suggestions
 * GET /api/follows/suggestions
 */
exports.getFollowSuggestions = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    const suggestions = await followService.getFollowSuggestions(userId, limit);

    res.json({
      success: true,
      data: {
        suggestions,
        total: suggestions.length,
      },
    });
  } catch (err) {
    console.error('Error getting follow suggestions:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get follow suggestions' 
    });
  }
};

/**
 * Remove a follower
 * DELETE /api/follows/followers/:userId
 */
exports.removeFollower = async (req, res) => {
  try {
    const userId = req.user.id;
    const followerId = parseInt(req.params.userId);

    if (isNaN(followerId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid user ID' 
      });
    }

    await followService.removeFollower(userId, followerId);

    res.json({
      success: true,
      message: 'Successfully removed follower',
    });
  } catch (err) {
    console.error('Error removing follower:', err);
    
    if (err.message === 'This user is not following you') {
      return res.status(404).json({ success: false, message: err.message });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to remove follower' 
    });
  }
};

/**
 * Batch check follow status for multiple users
 * POST /api/follows/check-multiple
 */
exports.checkMultipleFollows = async (req, res) => {
  try {
    const followerId = req.user.id;
    const { user_ids } = req.body;

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'user_ids array is required' 
      });
    }

    const followMap = await followService.checkMultipleFollows(followerId, user_ids);

    res.json({
      success: true,
      data: followMap,
    });
  } catch (err) {
    console.error('Error checking multiple follows:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to check follow status' 
    });
  }
};
