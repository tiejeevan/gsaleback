// routes/addresses.js
const express = require('express');
const router = express.Router();
const addressController = require('../controllers/addressController');
const authMiddleware = require('../middleware/authMiddleware');

// All address routes require authentication
router.get('/', authMiddleware, addressController.getUserAddresses);
router.get('/default/:type', authMiddleware, addressController.getDefaultAddress);
router.get('/:id', authMiddleware, addressController.getAddress);
router.post('/', authMiddleware, addressController.createAddress);
router.put('/:id', authMiddleware, addressController.updateAddress);
router.put('/:id/default', authMiddleware, addressController.setDefaultAddress);
router.delete('/:id', authMiddleware, addressController.deleteAddress);

module.exports = router;
