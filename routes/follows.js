// routes/follows.js
const express = require('express');
const router = express.Router();
const followController = require('../controllers/followController');
const authMiddleware = require('../middleware/authMiddleware');
const canWrite = require('../middleware/canWriteMiddleware');

// All routes require authentication
router.use(authMiddleware);

// ============= FOLLOW/UNFOLLOW =============
// Follow a user (requires write permission)
router.post('/:userId', canWrite, followController.followUser);

// Unfollow a user (requires write permission)
router.delete('/:userId', canWrite, followController.unfollowUser);

// Check if current user follows a specific user (read-only)
router.get('/:userId/status', followController.checkFollowStatus);

// ============= GET FOLLOWERS/FOLLOWING =============
// Get followers of a user (read-only)
router.get('/:userId/followers', followController.getFollowers);

// Get following list of a user (read-only)
router.get('/:userId/following', followController.getFollowing);

// Get follow stats (follower/following counts) (read-only)
router.get('/:userId/stats', followController.getFollowStats);

// ============= MUTUAL & SUGGESTIONS =============
// Get mutual follows (friends) (read-only)
router.get('/mutual/list', followController.getMutualFollows);

// Get follow suggestions (read-only)
router.get('/suggestions/list', followController.getFollowSuggestions);

// ============= MANAGE FOLLOWERS =============
// Remove a follower (prevent them from following you) (requires write permission)
router.delete('/followers/:userId', canWrite, followController.removeFollower);

// ============= BATCH OPERATIONS =============
// Check follow status for multiple users at once (read-only)
router.post('/check-multiple', followController.checkMultipleFollows);

module.exports = router;
