const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const authenticateToken = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// Create transaction (seller marks as sold)
router.post('/', transactionController.createTransaction);

// Confirm transaction (buyer confirms)
router.put('/:transactionId/confirm', transactionController.confirmTransaction);

// Cancel transaction
router.put('/:transactionId/cancel', transactionController.cancelTransaction);

// Get pending transactions
router.get('/pending', transactionController.getPendingTransactions);

// Get confirmed transactions
router.get('/confirmed', transactionController.getConfirmedTransactions);

// Get potential buyers for a product
router.get('/product/:productId/buyers', transactionController.getPotentialBuyers);

module.exports = router;
