// controllers/productsController.js
const productsService = require('../services/productsService');

class ProductsController {
  // ============================================
  // PRODUCT CRUD
  // ============================================

  /**
   * Create a new product
   * POST /api/products
   */
  async createProduct(req, res) {
    try {
      const userId = req.user.id;
      const productData = {
        ...req.body,
        userId,
        owner_id: req.body.owner_id || userId
      };

      // Generate slug if not provided
      if (!productData.slug && productData.title) {
        productData.slug = productData.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }

      const product = await productsService.createProduct(productData);

      // If product is pending approval, notify all admins
      if (product.status === 'pending') {
        const pool = require('../db');
        const io = req.app.get('io');
        
        // Get all admin users
        const adminsResult = await pool.query(
          `SELECT id FROM users WHERE role = 'admin'`
        );
        
        // Create notifications for each admin
        for (const admin of adminsResult.rows) {
          const notificationResult = await pool.query(
            `INSERT INTO notifications (recipient_user_id, actor_user_id, type, payload)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [
              admin.id,
              userId,
              'product_approval',
              JSON.stringify({
                productId: product.id,
                productTitle: product.title,
                productImage: product.images?.[0] || null
              })
            ]
          );
          
          // Emit real-time notification to admin
          if (io) {
            io.to(`user_${admin.id}`).emit('notification:new', {
              ...notificationResult.rows[0],
              actor_user_id: userId,
              type: 'product_approval'
            });
          }
        }
      }

      // Award XP for product creation (gamification)
      if (req.gamificationEnabled) {
        try {
          const xpService = require('../services/xpService');
          const badgeService = require('../services/badgeService');
          const io = req.app.get('io');
          await xpService.awardXP(userId, 'product_created', product.id, {}, io);
          await badgeService.checkAndAwardBadges(userId, io);
        } catch (gamErr) {
          console.error('Gamification error (non-blocking):', gamErr);
        }
      }

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        product
      });
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create product'
      });
    }
  }

  /**
   * Get all products with filters
   * GET /api/products
   */
  async getProducts(req, res) {
    try {
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        status: req.query.status,
        category_id: req.query.category_id,
        owner_type: req.query.owner_type,
        owner_id: req.query.owner_id,
        created_by: req.query.created_by,
        search: req.query.search,
        min_price: req.query.min_price,
        max_price: req.query.max_price,
        tags: req.query.tags ? req.query.tags.split(',') : undefined,
        sort_by: req.query.sort_by,
        sort_order: req.query.sort_order,
        include_deleted: req.query.include_deleted === 'true'
      };

      // Only include is_featured if explicitly provided
      if (req.query.is_featured !== undefined) {
        filters.is_featured = req.query.is_featured === 'true';
      }

      const result = await productsService.getProducts(filters);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch products'
      });
    }
  }

  /**
   * Get single product by ID
   * GET /api/products/:id
   */
  async getProductById(req, res) {
    try {
      const { id } = req.params;
      const product = await productsService.getProductById(id);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      // Increment views (async, don't wait)
      productsService.incrementViews(id).catch(err => 
        console.error('Error incrementing views:', err)
      );

      res.json({
        success: true,
        product
      });
    } catch (error) {
      console.error('Error fetching product:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch product'
      });
    }
  }

  /**
   * Update product
   * PUT /api/products/:id
   */
  async updateProduct(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const isAdmin = req.user.role === 'admin';

      const product = await productsService.updateProduct(id, userId, req.body, isAdmin);

      res.json({
        success: true,
        message: 'Product updated successfully',
        product
      });
    } catch (error) {
      console.error('Error updating product:', error);
      
      if (error.message === 'Product not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      
      if (error.message === 'Unauthorized to update this product') {
        return res.status(403).json({ success: false, error: error.message });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update product'
      });
    }
  }

  /**
   * Delete product (soft delete)
   * DELETE /api/products/:id
   */
  async deleteProduct(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const isAdmin = req.user.role === 'admin';

      const product = await productsService.deleteProduct(id, userId, isAdmin);

      res.json({
        success: true,
        message: 'Product deleted successfully',
        product
      });
    } catch (error) {
      console.error('Error deleting product:', error);
      
      if (error.message === 'Product not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      
      if (error.message === 'Unauthorized to delete this product') {
        return res.status(403).json({ success: false, error: error.message });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete product'
      });
    }
  }

  // ============================================
  // PRODUCT ACTIONS
  // ============================================

  /**
   * Update product stock
   * PATCH /api/products/:id/stock
   */
  async updateStock(req, res) {
    try {
      const { id } = req.params;
      const { quantity, operation } = req.body;

      if (!quantity || quantity < 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid quantity is required'
        });
      }

      const product = await productsService.updateStock(id, quantity, operation);

      res.json({
        success: true,
        message: 'Stock updated successfully',
        product
      });
    } catch (error) {
      console.error('Error updating stock:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update stock'
      });
    }
  }

  /**
   * Get products by owner
   * GET /api/products/owner/:ownerType/:ownerId
   */
  async getProductsByOwner(req, res) {
    try {
      const { ownerType, ownerId } = req.params;
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        status: req.query.status
      };

      const result = await productsService.getProductsByOwner(ownerType, ownerId, filters);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error fetching owner products:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch products'
      });
    }
  }

  /**
   * Get my products
   * GET /api/products/my
   */
  async getMyProducts(req, res) {
    try {
      const userId = req.user.id;
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        status: req.query.status
      };

      const result = await productsService.getProductsByOwner('User', userId, filters);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error fetching my products:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch products'
      });
    }
  }

  /**
   * Get featured products
   * GET /api/products/featured
   */
  async getFeaturedProducts(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const products = await productsService.getFeaturedProducts(limit);

      res.json({
        success: true,
        products
      });
    } catch (error) {
      console.error('Error fetching featured products:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch featured products'
      });
    }
  }

  /**
   * Search products
   * GET /api/products/search
   */
  async searchProducts(req, res) {
    try {
      const { q, ...filters } = req.query;
      
      if (!q) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required'
        });
      }

      const result = await productsService.getProducts({
        ...filters,
        search: q,
        page: parseInt(filters.page) || 1,
        limit: parseInt(filters.limit) || 20
      });

      res.json({
        success: true,
        query: q,
        ...result
      });
    } catch (error) {
      console.error('Error searching products:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to search products'
      });
    }
  }

  // ============================================
  // CATEGORY OPERATIONS
  // ============================================

  /**
   * Create category
   * POST /api/products/categories
   */
  async createCategory(req, res) {
    try {
      const { name, slug, description, image_url, parent_id } = req.body;

      if (!name || !slug) {
        return res.status(400).json({
          success: false,
          error: 'Name and slug are required'
        });
      }

      const category = await productsService.createCategory({
        name,
        slug,
        description,
        image_url,
        parent_id
      });

      res.status(201).json({
        success: true,
        message: 'Category created successfully',
        category
      });
    } catch (error) {
      console.error('Error creating category:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create category'
      });
    }
  }

  /**
   * Get all categories
   * GET /api/products/categories
   */
  async getCategories(req, res) {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const categories = await productsService.getCategories(includeInactive);

      res.json({
        success: true,
        categories
      });
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch categories'
      });
    }
  }

  /**
   * Get category by ID with products
   * GET /api/products/categories/:id
   */
  async getCategoryById(req, res) {
    try {
      const { id } = req.params;
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20
      };

      const category = await productsService.getCategoryById(id, filters);

      res.json({
        success: true,
        category
      });
    } catch (error) {
      console.error('Error fetching category:', error);
      
      if (error.message === 'Category not found') {
        return res.status(404).json({ success: false, error: error.message });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch category'
      });
    }
  }

  /**
   * Update category
   * PUT /api/products/categories/:id
   */
  async updateCategory(req, res) {
    try {
      const { id } = req.params;
      const category = await productsService.updateCategory(id, req.body);

      res.json({
        success: true,
        message: 'Category updated successfully',
        category
      });
    } catch (error) {
      console.error('Error updating category:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update category'
      });
    }
  }

  /**
   * Delete category
   * DELETE /api/products/categories/:id
   */
  async deleteCategory(req, res) {
    try {
      const { id } = req.params;
      const category = await productsService.deleteCategory(id);

      res.json({
        success: true,
        message: 'Category deleted successfully',
        category
      });
    } catch (error) {
      console.error('Error deleting category:', error);
      
      if (error.message === 'Category not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      
      if (error.message.includes('Cannot delete category')) {
        return res.status(400).json({ success: false, error: error.message });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete category'
      });
    }
  }

  // ============================================
  // ADMIN OPERATIONS
  // ============================================

  /**
   * Get products pending approval
   * GET /api/admin/products/pending
   */
  async getPendingProducts(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;

      const result = await productsService.getPendingProducts(page, limit);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error fetching pending products:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch pending products'
      });
    }
  }

  /**
   * Approve product
   * PUT /api/admin/products/:id/approve
   */
  async approveProduct(req, res) {
    try {
      const { id } = req.params;
      const adminId = req.user.id;

      const product = await productsService.approveProduct(id, adminId);

      // Notify product owner about approval
      const pool = require('../db');
      const io = req.app.get('io');
      
      const notificationResult = await pool.query(
        `INSERT INTO notifications (recipient_user_id, actor_user_id, type, payload)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          product.created_by,
          adminId,
          'product_approved',
          JSON.stringify({
            productId: product.id,
            productTitle: product.title
          })
        ]
      );
      
      // Emit real-time notification to product owner
      if (io) {
        io.to(`user_${product.created_by}`).emit('notification:new', {
          ...notificationResult.rows[0],
          actor_user_id: adminId,
          type: 'product_approved'
        });
      }

      res.json({
        success: true,
        message: 'Product approved successfully',
        product
      });
    } catch (error) {
      console.error('Error approving product:', error);
      
      if (error.message === 'Product not found') {
        return res.status(404).json({ success: false, error: error.message });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to approve product'
      });
    }
  }

  /**
   * Reject product
   * PUT /api/admin/products/:id/reject
   */
  async rejectProduct(req, res) {
    try {
      const { id } = req.params;
      const adminId = req.user.id;
      const { reason } = req.body;

      const product = await productsService.rejectProduct(id, adminId);

      // Notify product owner about rejection
      const pool = require('../db');
      const io = req.app.get('io');
      
      const notificationResult = await pool.query(
        `INSERT INTO notifications (recipient_user_id, actor_user_id, type, payload)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          product.created_by,
          adminId,
          'product_rejected',
          JSON.stringify({
            productId: product.id,
            productTitle: product.title,
            reason: reason || 'No reason provided'
          })
        ]
      );
      
      // Emit real-time notification to product owner
      if (io) {
        io.to(`user_${product.created_by}`).emit('notification:new', {
          ...notificationResult.rows[0],
          actor_user_id: adminId,
          type: 'product_rejected'
        });
      }

      res.json({
        success: true,
        message: 'Product rejected successfully',
        product
      });
    } catch (error) {
      console.error('Error rejecting product:', error);
      
      if (error.message === 'Product not found') {
        return res.status(404).json({ success: false, error: error.message });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to reject product'
      });
    }
  }

  /**
   * Restore deleted product
   * PUT /api/admin/products/:id/restore
   */
  async restoreProduct(req, res) {
    try {
      const { id } = req.params;
      const product = await productsService.restoreProduct(id);

      res.json({
        success: true,
        message: 'Product restored successfully',
        product
      });
    } catch (error) {
      console.error('Error restoring product:', error);
      
      if (error.message === 'Product not found') {
        return res.status(404).json({ success: false, error: error.message });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to restore product'
      });
    }
  }

  /**
   * Permanently delete product
   * DELETE /api/admin/products/:id/permanent
   */
  async permanentlyDeleteProduct(req, res) {
    try {
      const { id } = req.params;
      const product = await productsService.permanentlyDeleteProduct(id);

      res.json({
        success: true,
        message: 'Product permanently deleted',
        product
      });
    } catch (error) {
      console.error('Error permanently deleting product:', error);
      
      if (error.message === 'Product not found') {
        return res.status(404).json({ success: false, error: error.message });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to permanently delete product'
      });
    }
  }

  /**
   * Get product statistics
   * GET /api/admin/products/stats
   */
  async getProductStats(req, res) {
    try {
      const stats = await productsService.getProductStats();

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Error fetching product stats:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch product statistics'
      });
    }
  }
}

module.exports = new ProductsController();
