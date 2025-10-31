// routes/likes.js
const express = require('express');
const router = express.Router();
const { addLike, removeLike, getLikesForTarget, getLikeCount } = require('../controllers/likesController');
const authMiddleware = require('../middleware/authMiddleware'); // your existing token middleware

// Routes
router.post('/', authMiddleware, addLike); // Like a post/comment
router.delete('/', authMiddleware, removeLike); // Unlike
router.get('/:target_type/:target_id', getLikesForTarget); // All likes for target
router.get('/count/:target_type/:target_id', getLikeCount); // Like count only

module.exports = router;
