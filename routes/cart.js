// routes/cart.js
const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const authMiddleware = require('../middleware/authMiddleware');

// All cart routes require authentication
router.use(authMiddleware);

// Cart operations
router.get('/', cartController.getCart);
router.get('/count', cartController.getCartCount);
router.post('/add', cartController.addToCart);
router.post('/validate', cartController.validateCart);
router.post('/update-prices', cartController.updatePrices);
router.put('/item/:id', cartController.updateCartItem);
router.delete('/item/:id', cartController.removeFromCart);
router.delete('/', cartController.clearCart);

module.exports = router;
