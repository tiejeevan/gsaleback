// controllers/cartController.js
const cartService = require('../services/cartService');

class CartController {
  /**
   * Get user's cart with items
   * GET /api/cart
   */
  async getCart(req, res) {
    try {
      const cart = await cartService.getCartWithItems(req.user.id);
      res.json({
        success: true,
        cart
      });
    } catch (error) {
      console.error('Get cart error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get cart',
        error: error.message
      });
    }
  }

  /**
   * Add item to cart
   * POST /api/cart/add
   */
  async addToCart(req, res) {
    try {
      const { product_id, quantity = 1, selected_attributes = {} } = req.body;

      if (!product_id) {
        return res.status(400).json({
          success: false,
          message: 'Product ID is required'
        });
      }

      if (quantity < 1) {
        return res.status(400).json({
          success: false,
          message: 'Quantity must be at least 1'
        });
      }

      const cartItem = await cartService.addToCart(
        req.user.id,
        product_id,
        quantity,
        selected_attributes
      );

      // Get updated cart
      const cart = await cartService.getCartWithItems(req.user.id);

      res.json({
        success: true,
        message: 'Item added to cart',
        cart_item: cartItem,
        cart
      });
    } catch (error) {
      console.error('Add to cart error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to add item to cart'
      });
    }
  }

  /**
   * Update cart item quantity
   * PUT /api/cart/item/:id
   */
  async updateCartItem(req, res) {
    try {
      const { id } = req.params;
      const { quantity } = req.body;

      if (!quantity || quantity < 1) {
        return res.status(400).json({
          success: false,
          message: 'Valid quantity is required'
        });
      }

      const cartItem = await cartService.updateCartItem(req.user.id, id, quantity);

      // Get updated cart
      const cart = await cartService.getCartWithItems(req.user.id);

      res.json({
        success: true,
        message: 'Cart item updated',
        cart_item: cartItem,
        cart
      });
    } catch (error) {
      console.error('Update cart item error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update cart item'
      });
    }
  }

  /**
   * Remove item from cart
   * DELETE /api/cart/item/:id
   */
  async removeFromCart(req, res) {
    try {
      const { id } = req.params;

      await cartService.removeFromCart(req.user.id, id);

      // Get updated cart
      const cart = await cartService.getCartWithItems(req.user.id);

      res.json({
        success: true,
        message: 'Item removed from cart',
        cart
      });
    } catch (error) {
      console.error('Remove from cart error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to remove item from cart'
      });
    }
  }

  /**
   * Clear entire cart
   * DELETE /api/cart
   */
  async clearCart(req, res) {
    try {
      await cartService.clearCart(req.user.id);

      res.json({
        success: true,
        message: 'Cart cleared'
      });
    } catch (error) {
      console.error('Clear cart error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear cart',
        error: error.message
      });
    }
  }

  /**
   * Validate cart before checkout
   * POST /api/cart/validate
   */
  async validateCart(req, res) {
    try {
      const validation = await cartService.validateCart(req.user.id);

      res.json({
        success: true,
        ...validation
      });
    } catch (error) {
      console.error('Validate cart error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to validate cart',
        error: error.message
      });
    }
  }

  /**
   * Update cart prices to current product prices
   * POST /api/cart/update-prices
   */
  async updatePrices(req, res) {
    try {
      const cart = await cartService.updateCartPrices(req.user.id);

      res.json({
        success: true,
        message: 'Cart prices updated',
        cart
      });
    } catch (error) {
      console.error('Update cart prices error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update cart prices',
        error: error.message
      });
    }
  }

  /**
   * Get cart item count
   * GET /api/cart/count
   */
  async getCartCount(req, res) {
    try {
      const count = await cartService.getCartItemCount(req.user.id);

      res.json({
        success: true,
        count
      });
    } catch (error) {
      console.error('Get cart count error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get cart count',
        error: error.message
      });
    }
  }
}

module.exports = new CartController();
