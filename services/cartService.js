// services/cartService.js
const pool = require('../db');

class CartService {
  // ============================================
  // CART OPERATIONS
  // ============================================

  /**
   * Get or create user's active cart
   */
  async getOrCreateCart(userId) {
    const client = await pool.connect();
    try {
      // Try to get existing active cart
      let result = await client.query(
        `SELECT * FROM carts WHERE user_id = $1 AND status = 'active'`,
        [userId]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      // Create new cart if none exists
      result = await client.query(
        `INSERT INTO carts (user_id, status, expires_at)
         VALUES ($1, 'active', NOW() + INTERVAL '30 days')
         RETURNING *`,
        [userId]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Get cart with all items and product details
   */
  async getCartWithItems(userId) {
    const client = await pool.connect();
    try {
      // Get cart
      const cart = await this.getOrCreateCart(userId);

      // Get cart items with product details
      const itemsResult = await client.query(
        `SELECT 
          ci.*,
          p.title as product_title,
          p.slug as product_slug,
          p.images as product_images,
          p.stock_quantity,
          p.status as product_status,
          p.price as current_price
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.cart_id = $1
        ORDER BY ci.created_at DESC`,
        [cart.id]
      );

      // Recalculate totals to ensure accuracy
      const actualTotalItems = itemsResult.rows.reduce((sum, item) => sum + item.quantity, 0);
      const actualTotalAmount = itemsResult.rows.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);

      // Update cart if totals don't match
      if (cart.total_items !== actualTotalItems || parseFloat(cart.total_amount) !== actualTotalAmount) {
        await client.query(
          `UPDATE carts 
           SET total_items = $1, total_amount = $2, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $3`,
          [actualTotalItems, actualTotalAmount, cart.id]
        );
        cart.total_items = actualTotalItems;
        cart.total_amount = actualTotalAmount.toFixed(2);
      }

      return {
        ...cart,
        items: itemsResult.rows
      };
    } finally {
      client.release();
    }
  }

  /**
   * Add item to cart
   */
  async addToCart(userId, productId, quantity, selectedAttributes = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get or create cart
      const cart = await this.getOrCreateCart(userId);

      // Get product details
      const productResult = await client.query(
        `SELECT id, price, stock_quantity, status FROM products WHERE id = $1`,
        [productId]
      );

      if (productResult.rows.length === 0) {
        throw new Error('Product not found');
      }

      const product = productResult.rows[0];

      // Validate product status
      if (product.status !== 'active') {
        throw new Error('Product is not available for purchase');
      }

      // Validate stock
      if (product.stock_quantity < quantity) {
        throw new Error(`Only ${product.stock_quantity} items available in stock`);
      }

      // Check if item already exists in cart
      const existingItem = await client.query(
        `SELECT * FROM cart_items WHERE cart_id = $1 AND product_id = $2`,
        [cart.id, productId]
      );

      let result;
      if (existingItem.rows.length > 0) {
        // Update existing item
        const newQuantity = existingItem.rows[0].quantity + quantity;
        
        // Validate total quantity against stock
        if (product.stock_quantity < newQuantity) {
          throw new Error(`Only ${product.stock_quantity} items available in stock`);
        }

        result = await client.query(
          `UPDATE cart_items 
           SET quantity = $1, 
               subtotal = $1 * price,
               selected_attributes = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3
           RETURNING *`,
          [newQuantity, JSON.stringify(selectedAttributes), existingItem.rows[0].id]
        );
      } else {
        // Add new item
        const subtotal = product.price * quantity;
        result = await client.query(
          `INSERT INTO cart_items (cart_id, product_id, quantity, price, subtotal, selected_attributes)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [cart.id, productId, quantity, product.price, subtotal, JSON.stringify(selectedAttributes)]
        );
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update cart item quantity
   */
  async updateCartItem(userId, cartItemId, quantity) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Ensure quantity is a number
      const quantityNum = parseInt(quantity, 10);
      if (isNaN(quantityNum) || quantityNum < 1) {
        throw new Error('Invalid quantity');
      }

      // Verify cart item belongs to user
      const itemResult = await client.query(
        `SELECT ci.*, c.user_id, p.stock_quantity, p.status
         FROM cart_items ci
         JOIN carts c ON ci.cart_id = c.id
         JOIN products p ON ci.product_id = p.id
         WHERE ci.id = $1`,
        [cartItemId]
      );

      if (itemResult.rows.length === 0) {
        throw new Error('Cart item not found');
      }

      const item = itemResult.rows[0];

      if (item.user_id !== userId) {
        throw new Error('Unauthorized');
      }

      // Validate product status
      if (item.status !== 'active') {
        throw new Error('Product is no longer available');
      }

      // Validate stock
      if (item.stock_quantity < quantityNum) {
        throw new Error(`Only ${item.stock_quantity} items available in stock`);
      }

      // Update quantity - use separate parameters to avoid type confusion
      const result = await client.query(
        `UPDATE cart_items 
         SET quantity = $1, 
             subtotal = $2 * price,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [quantityNum, quantityNum, cartItemId]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Remove item from cart
   */
  async removeFromCart(userId, cartItemId) {
    const client = await pool.connect();
    try {
      // Verify cart item belongs to user
      const itemResult = await client.query(
        `SELECT ci.*, c.user_id
         FROM cart_items ci
         JOIN carts c ON ci.cart_id = c.id
         WHERE ci.id = $1`,
        [cartItemId]
      );

      if (itemResult.rows.length === 0) {
        throw new Error('Cart item not found');
      }

      if (itemResult.rows[0].user_id !== userId) {
        throw new Error('Unauthorized');
      }

      // Delete item
      await client.query('DELETE FROM cart_items WHERE id = $1', [cartItemId]);

      return { success: true };
    } finally {
      client.release();
    }
  }

  /**
   * Clear entire cart
   */
  async clearCart(userId) {
    const client = await pool.connect();
    try {
      const cart = await this.getOrCreateCart(userId);
      await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cart.id]);
      return { success: true };
    } finally {
      client.release();
    }
  }

  /**
   * Validate cart before checkout
   */
  async validateCart(userId) {
    const client = await pool.connect();
    try {
      const cartData = await this.getCartWithItems(userId);
      const issues = [];

      if (cartData.items.length === 0) {
        return {
          valid: false,
          issues: ['Cart is empty']
        };
      }

      for (const item of cartData.items) {
        // Check if product is still active
        if (item.product_status !== 'active') {
          issues.push(`${item.product_title} is no longer available`);
        }

        // Check stock availability
        if (item.stock_quantity < item.quantity) {
          issues.push(`${item.product_title}: Only ${item.stock_quantity} items available (you have ${item.quantity} in cart)`);
        }

        // Check if price has changed
        if (parseFloat(item.price) !== parseFloat(item.current_price)) {
          issues.push(`${item.product_title}: Price has changed from $${item.price} to $${item.current_price}`);
        }
      }

      return {
        valid: issues.length === 0,
        issues,
        cart: cartData
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update cart item prices to current product prices
   */
  async updateCartPrices(userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const cart = await this.getOrCreateCart(userId);

      // Update all cart item prices to current product prices
      await client.query(
        `UPDATE cart_items ci
         SET price = p.price,
             subtotal = ci.quantity * p.price,
             updated_at = CURRENT_TIMESTAMP
         FROM products p
         WHERE ci.product_id = p.id
         AND ci.cart_id = $1`,
        [cart.id]
      );

      await client.query('COMMIT');
      return await this.getCartWithItems(userId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Mark cart as converted (after successful order)
   */
  async convertCart(cartId) {
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE carts SET status = 'converted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [cartId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get cart item count for user
   */
  async getCartItemCount(userId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT COALESCE(SUM(ci.quantity), 0) as item_count
         FROM carts c
         LEFT JOIN cart_items ci ON c.id = ci.cart_id
         WHERE c.user_id = $1 AND c.status = 'active'`,
        [userId]
      );

      return parseInt(result.rows[0].item_count);
    } finally {
      client.release();
    }
  }
}

module.exports = new CartService();
