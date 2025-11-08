// routes/follows.js
const express = require('express');
const router = express.Router();
const followController = require('../controllers/followController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// ============= FOLLOW/UNFOLLOW =============
// Follow a user
router.post('/:userId', followController.followUser);

// Unfollow a user
router.delete('/:userId', followController.unfollowUser);

// Check if current user follows a specific user
router.get('/:userId/status', followController.checkFollowStatus);

// ============= GET FOLLOWERS/FOLLOWING =============
// Get followers of a user
router.get('/:userId/followers', followController.getFollowers);

// Get following list of a user
router.get('/:userId/following', followController.getFollowing);

// Get follow stats (follower/following counts)
router.get('/:userId/stats', followController.getFollowStats);

// ============= MUTUAL & SUGGESTIONS =============
// Get mutual follows (friends)
router.get('/mutual/list', followController.getMutualFollows);

// Get follow suggestions
router.get('/suggestions/list', followController.getFollowSuggestions);

// ============= MANAGE FOLLOWERS =============
// Remove a follower (prevent them from following you)
router.delete('/followers/:userId', followController.removeFollower);

// ============= BATCH OPERATIONS =============
// Check follow status for multiple users at once
router.post('/check-multiple', followController.checkMultipleFollows);

module.exports = router;
