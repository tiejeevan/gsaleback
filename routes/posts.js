const express = require('express');
const router = express.Router();
const multer = require('multer');
const postsController = require('../controllers/postsController');
const verifyToken = require('../middleware/authMiddleware');

// Multer memory storage for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ================= Routes =================

// Create a new post with attachments
router.post('/', verifyToken, upload.array('files', 10), postsController.createPost);

// Get all posts
router.get('/', verifyToken, postsController.getAllPosts);

// Get posts by user ID
router.get('/user/:userId', verifyToken, postsController.getPostsByUserId);

// Get pinned post by user ID
router.get('/user/:userId/pinned', verifyToken, postsController.getPinnedPost);

// Get single post by ID
router.get('/:id', verifyToken, postsController.getPostById);

// Update post
router.put('/:id', verifyToken, postsController.updatePost);

// Delete post
router.delete('/:id', verifyToken, postsController.deletePost);

// Pin post
router.post('/:id/pin', verifyToken, postsController.pinPost);

// Unpin post
router.post('/:id/unpin', verifyToken, postsController.unpinPost);

module.exports = router;