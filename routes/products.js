// routes/products.js
const express = require('express');
const router = express.Router();
const productsController = require('../controllers/productsController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// ============================================
// ADMIN ROUTES (Admin only) - Must come first!
// ============================================

// Get product statistics
router.get('/admin/stats', authMiddleware, adminMiddleware, productsController.getProductStats);

// Get pending products
router.get('/admin/pending', authMiddleware, adminMiddleware, productsController.getPendingProducts);

// Approve product
router.put('/admin/:id/approve', authMiddleware, adminMiddleware, productsController.approveProduct);

// Reject product
router.put('/admin/:id/reject', authMiddleware, adminMiddleware, productsController.rejectProduct);

// Restore deleted product
router.put('/admin/:id/restore', authMiddleware, adminMiddleware, productsController.restoreProduct);

// Permanently delete product
router.delete('/admin/:id/permanent', authMiddleware, adminMiddleware, productsController.permanentlyDeleteProduct);

// ============================================
// CATEGORY ROUTES (Public read, admin write)
// ============================================

// Get all categories
router.get('/categories', productsController.getCategories);

// Get category by ID with products
router.get('/categories/:id', productsController.getCategoryById);

// Create category (admin only)
router.post('/categories', authMiddleware, adminMiddleware, productsController.createCategory);

// Update category (admin only)
router.put('/categories/:id', authMiddleware, adminMiddleware, productsController.updateCategory);

// Delete category (admin only)
router.delete('/categories/:id', authMiddleware, adminMiddleware, productsController.deleteCategory);

// ============================================
// SPECIFIC ROUTES (Must come before /:id)
// ============================================

// Search products
router.get('/search', productsController.searchProducts);

// Get featured products
router.get('/featured', productsController.getFeaturedProducts);

// Get my products (authenticated)
router.get('/my', authMiddleware, productsController.getMyProducts);

// Get products by owner
router.get('/owner/:ownerType/:ownerId', productsController.getProductsByOwner);

// ============================================
// AUTHENTICATED ROUTES (Login required)
// ============================================

// Create product
router.post('/', authMiddleware, productsController.createProduct);

// Update product stock
router.patch('/:id/stock', authMiddleware, productsController.updateStock);

// Update product
router.put('/:id', authMiddleware, productsController.updateProduct);

// Delete product (soft delete)
router.delete('/:id', authMiddleware, productsController.deleteProduct);

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

// Get all products (with filters)
router.get('/', productsController.getProducts);

// Get single product - MUST BE LAST!
router.get('/:id', productsController.getProductById);

module.exports = router;
