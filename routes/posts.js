const express = require('express');
const router = express.Router();
const multer = require('multer');
const postsController = require('../controllers/postsController');
const verifyToken = require('../middleware/authMiddleware');
const canWrite = require('../middleware/canWriteMiddleware');

// Multer memory storage for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ================= Routes =================

// Create a new post with attachments (requires write permission)
router.post('/', verifyToken, canWrite, upload.array('files', 10), postsController.createPost);

// Get all posts (read-only, no write check needed)
router.get('/', verifyToken, postsController.getAllPosts);

// Get posts by user ID (read-only)
router.get('/user/:userId', verifyToken, postsController.getPostsByUserId);

// Get pinned post by user ID (read-only)
router.get('/user/:userId/pinned', verifyToken, postsController.getPinnedPost);

// Get single post by ID (read-only)
router.get('/:id', verifyToken, postsController.getPostById);

// Update post (requires write permission)
router.put('/:id', verifyToken, canWrite, postsController.updatePost);

// Delete post (requires write permission)
router.delete('/:id', verifyToken, canWrite, postsController.deletePost);

// Pin post (requires write permission)
router.post('/:id/pin', verifyToken, canWrite, postsController.pinPost);

// Unpin post (requires write permission)
router.post('/:id/unpin', verifyToken, canWrite, postsController.unpinPost);

module.exports = router;