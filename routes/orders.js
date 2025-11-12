// routes/orders.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// User order routes (require authentication)
router.post('/checkout', authMiddleware, orderController.checkout);
router.get('/', authMiddleware, orderController.getUserOrders);
router.get('/:id', authMiddleware, orderController.getOrder);
router.get('/:id/track', authMiddleware, orderController.trackOrder);
router.put('/:id/cancel', authMiddleware, orderController.cancelOrder);
router.post('/:id/reorder', authMiddleware, orderController.reorder);

// Admin order routes (require admin role)
router.get('/admin/stats', authMiddleware, adminMiddleware, orderController.getOrderStats);
router.get('/admin/all', authMiddleware, adminMiddleware, orderController.getAllOrders);
router.get('/admin/:id', authMiddleware, adminMiddleware, orderController.getOrderAdmin);
router.put('/admin/:id/status', authMiddleware, adminMiddleware, orderController.updateOrderStatus);
router.put('/admin/:id/shipping', authMiddleware, adminMiddleware, orderController.updateShipping);
router.post('/admin/:id/refund', authMiddleware, adminMiddleware, orderController.refundOrder);

module.exports = router;
