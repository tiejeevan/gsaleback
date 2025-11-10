const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminMiddleware');

// All routes require authentication and admin role
router.use(auth);
router.use(isAdmin);

// Dashboard stats
router.get('/stats', adminController.getAdminStats);

// User management
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserDetails);
router.put('/users/:id', adminController.updateUser);

// User status actions
router.post('/users/:id/mute', adminController.muteUser);
router.post('/users/:id/unmute', adminController.unmuteUser);
router.post('/users/:id/suspend', adminController.suspendUser);
router.post('/users/:id/unsuspend', adminController.unsuspendUser);

// User deletion
router.delete('/users/:id/soft', adminController.softDeleteUser);
router.post('/users/:id/restore', adminController.restoreUser);
router.delete('/users/:id/permanent', adminController.permanentDeleteUser);

// Admin logs
router.get('/logs', adminController.getAdminLogs);

module.exports = router;
