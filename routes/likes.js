// routes/likes.js
const express = require('express');
const router = express.Router();
const { addLike, removeLike, getLikesForTarget, getLikeCount } = require('../controllers/likesController');
const authMiddleware = require('../middleware/authMiddleware');
const canWrite = require('../middleware/canWriteMiddleware');

// Routes
router.post('/', authMiddleware, canWrite, addLike); // Like a post/comment (requires write permission)
router.delete('/', authMiddleware, canWrite, removeLike); // Unlike (requires write permission)
router.get('/:target_type/:target_id', getLikesForTarget); // All likes for target (read-only)
router.get('/count/:target_type/:target_id', getLikeCount); // Like count only (read-only)

module.exports = router;
