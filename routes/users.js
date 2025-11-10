// routes/users.js
const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const auth = require('../middleware/authMiddleware');

// Private routes (need token) - SPECIFIC ROUTES FIRST
router.get('/me', auth, usersController.getMe);
router.put('/me', auth, usersController.updateMe);
router.put('/me/password', auth, usersController.changePassword);
router.patch('/me/deactivate', auth, usersController.deactivateMe);
router.get('/search/mentions', auth, usersController.searchUsersForMentions);
router.get('/search', auth, usersController.searchActiveUsers);

// Public routes - GENERIC ROUTES LAST
router.get('/:id', usersController.getPublicProfile);

module.exports = router;
