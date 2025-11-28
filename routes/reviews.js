const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const authenticateToken = require('../middleware/authMiddleware');

// Get reviews for a user (public)
router.get('/user/:userId', reviewController.getUserReviews);

// Get review stats for a user (public)
router.get('/user/:userId/stats', reviewController.getUserReviewStats);

// All routes below require authentication
router.use(authenticateToken);

// Create a review for a transaction
router.post('/transaction/:transactionId', reviewController.createReview);

// Mark review as helpful
router.post('/:reviewId/helpful', reviewController.addHelpfulVote);

// Remove helpful vote
router.delete('/:reviewId/helpful', reviewController.removeHelpfulVote);

// Respond to a review
router.post('/:reviewId/respond', reviewController.respondToReview);

module.exports = router;
