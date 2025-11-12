// services/orderService.js
const pool = require('../db');
const cartService = require('./cartService');

class OrderService {
  // ============================================
  // ORDER CREATION
  // ============================================

  /**
   * Create order from cart
   */
  async createOrder(userId, orderData) {
    const {
      shipping_address,
      billing_address,
      shipping_method,
      payment_method,
      customer_notes,
      tax_rate = 0.08, // Default 8% tax
      shipping_amount = 0,
      discount_amount = 0
    } = orderData;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Validate cart
      const validation = await cartService.validateCart(userId);
      if (!validation.valid) {
        throw new Error(`Cart validation failed: ${validation.issues.join(', ')}`);
      }

      const cart = validation.cart;

      if (cart.items.length === 0) {
        throw new Error('Cart is empty');
      }

      // Calculate totals
      const subtotal = parseFloat(cart.total_amount);
      const tax_amount = subtotal * tax_rate;
      const total_amount = subtotal + tax_amount + shipping_amount - discount_amount;

      // Generate order number
      const orderNumberResult = await client.query('SELECT generate_order_number() as order_number');
      const order_number = orderNumberResult.rows[0].order_number;

      // Create order
      const orderResult = await client.query(
        `INSERT INTO orders (
          order_number, user_id, status, payment_status,
          subtotal, tax_amount, shipping_amount, discount_amount, total_amount,
          shipping_address, billing_address, shipping_method, payment_method,
          customer_notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          order_number, userId, 'pending', 'pending',
          subtotal, tax_amount, shipping_amount, discount_amount, total_amount,
          JSON.stringify(shipping_address),
          billing_address ? JSON.stringify(billing_address) : null,
          shipping_method, payment_method, customer_notes
        ]
      );

      const order = orderResult.rows[0];

      // Create order items from cart items
      for (const item of cart.items) {
        await client.query(
          `INSERT INTO order_items (
            order_id, product_id, product_title, product_slug, product_sku,
            product_image, quantity, unit_price, subtotal, selected_attributes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            order.id,
            item.product_id,
            item.product_title,
            item.product_slug,
            null, // SKU would come from product if needed
            item.product_images ? item.product_images[0] : null,
            item.quantity,
            item.price,
            item.subtotal,
            item.selected_attributes
          ]
        );

        // Decrease product stock
        await client.query(
          `UPDATE products 
           SET stock_quantity = stock_quantity - $1,
               sales_count = sales_count + $2
           WHERE id = $3`,
          [item.quantity, item.quantity, item.product_id]
        );
      }

      // Create initial status history
      await this.addStatusHistory(order.id, null, 'pending', userId, 'Order created', client);

      // Mark cart as converted
      await client.query(
        `UPDATE carts SET status = 'converted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [cart.id]
      );

      await client.query('COMMIT');

      // Return complete order with items
      return await this.getOrderById(order.id, userId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId, userId = null) {
    const client = await pool.connect();
    try {
      let query = `SELECT * FROM orders WHERE id = $1`;
      const params = [orderId];

      if (userId) {
        query += ` AND user_id = $2`;
        params.push(userId);
      }

      const orderResult = await client.query(query, params);

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = orderResult.rows[0];

      // Get order items
      const itemsResult = await client.query(
        `SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at`,
        [orderId]
      );

      // Get status history
      const historyResult = await client.query(
        `SELECT 
          osh.*,
          u.username as changed_by_username
         FROM order_status_history osh
         LEFT JOIN users u ON osh.changed_by = u.id
         WHERE osh.order_id = $1
         ORDER BY osh.created_at DESC`,
        [orderId]
      );

      return {
        ...order,
        items: itemsResult.rows,
        status_history: historyResult.rows
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get user's orders
   */
  async getUserOrders(userId, filters = {}) {
    const {
      status,
      payment_status,
      page = 1,
      limit = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = filters;

    const client = await pool.connect();
    try {
      const offset = (page - 1) * limit;
      const conditions = ['user_id = $1'];
      const params = [userId];
      let paramCount = 1;

      if (status) {
        paramCount++;
        conditions.push(`status = $${paramCount}`);
        params.push(status);
      }

      if (payment_status) {
        paramCount++;
        conditions.push(`payment_status = $${paramCount}`);
        params.push(payment_status);
      }

      const whereClause = conditions.join(' AND ');

      // Get total count
      const countResult = await client.query(
        `SELECT COUNT(*) FROM orders WHERE ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count);

      // Get orders
      const ordersResult = await client.query(
        `SELECT 
          o.*,
          COUNT(oi.id) as item_count
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE ${whereClause}
         GROUP BY o.id
         ORDER BY ${sort_by} ${sort_order}
         LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
        [...params, limit, offset]
      );

      return {
        orders: ordersResult.rows,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId, newStatus, userId, notes = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get current order
      const orderResult = await client.query(
        `SELECT * FROM orders WHERE id = $1`,
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = orderResult.rows[0];
      const oldStatus = order.status;

      // Update order status
      const updateFields = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
      const updateParams = [newStatus];
      let paramCount = 1;

      // Set timestamp fields based on status
      if (newStatus === 'confirmed' && !order.confirmed_at) {
        updateFields.push(`confirmed_at = CURRENT_TIMESTAMP`);
      } else if (newStatus === 'shipped' && !order.shipped_at) {
        updateFields.push(`shipped_at = CURRENT_TIMESTAMP`);
      } else if (newStatus === 'delivered' && !order.delivered_at) {
        updateFields.push(`delivered_at = CURRENT_TIMESTAMP`);
      } else if (newStatus === 'cancelled' && !order.cancelled_at) {
        updateFields.push(`cancelled_at = CURRENT_TIMESTAMP`);
      }

      await client.query(
        `UPDATE orders SET ${updateFields.join(', ')} WHERE id = $2`,
        [...updateParams, orderId]
      );

      // Add to status history
      await this.addStatusHistory(orderId, oldStatus, newStatus, userId, notes, client);

      await client.query('COMMIT');

      return await this.getOrderById(orderId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId, userId, reason = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get order
      const orderResult = await client.query(
        `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
        [orderId, userId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = orderResult.rows[0];

      // Check if order can be cancelled
      if (['shipped', 'delivered', 'cancelled', 'refunded'].includes(order.status)) {
        throw new Error(`Cannot cancel order with status: ${order.status}`);
      }

      // Restore product stock
      const itemsResult = await client.query(
        `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
        [orderId]
      );

      for (const item of itemsResult.rows) {
        await client.query(
          `UPDATE products 
           SET stock_quantity = stock_quantity + $1,
               sales_count = sales_count - $2
           WHERE id = $3`,
          [item.quantity, item.quantity, item.product_id]
        );
      }

      // Update order status
      await this.updateOrderStatus(orderId, 'cancelled', userId, reason);

      await client.query('COMMIT');

      return await this.getOrderById(orderId, userId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add status history entry
   */
  async addStatusHistory(orderId, oldStatus, newStatus, userId, notes = null, client = null) {
    const shouldRelease = !client;
    if (!client) {
      client = await pool.connect();
    }

    try {
      await client.query(
        `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, oldStatus, newStatus, userId, notes]
      );
    } finally {
      if (shouldRelease) {
        client.release();
      }
    }
  }

  // ============================================
  // ADMIN OPERATIONS
  // ============================================

  /**
   * Get all orders (admin)
   */
  async getAllOrders(filters = {}) {
    const {
      status,
      payment_status,
      user_id,
      search,
      date_from,
      date_to,
      page = 1,
      limit = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = filters;

    const client = await pool.connect();
    try {
      const offset = (page - 1) * limit;
      const conditions = [];
      const params = [];
      let paramCount = 0;

      if (status) {
        paramCount++;
        conditions.push(`o.status = $${paramCount}`);
        params.push(status);
      }

      if (payment_status) {
        paramCount++;
        conditions.push(`o.payment_status = $${paramCount}`);
        params.push(payment_status);
      }

      if (user_id) {
        paramCount++;
        conditions.push(`o.user_id = $${paramCount}`);
        params.push(user_id);
      }

      if (search) {
        paramCount++;
        conditions.push(`(o.order_number ILIKE $${paramCount} OR u.username ILIKE $${paramCount})`);
        params.push(`%${search}%`);
      }

      if (date_from) {
        paramCount++;
        conditions.push(`o.created_at >= $${paramCount}`);
        params.push(date_from);
      }

      if (date_to) {
        paramCount++;
        conditions.push(`o.created_at <= $${paramCount}`);
        params.push(date_to);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countResult = await client.query(
        `SELECT COUNT(*) FROM orders o
         LEFT JOIN users u ON o.user_id = u.id
         ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count);

      // Get orders
      const ordersResult = await client.query(
        `SELECT 
          o.*,
          u.username,
          u.email,
          COUNT(oi.id) as item_count
         FROM orders o
         LEFT JOIN users u ON o.user_id = u.id
         LEFT JOIN order_items oi ON o.id = oi.order_id
         ${whereClause}
         GROUP BY o.id, u.username, u.email
         ORDER BY o.${sort_by} ${sort_order}
         LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
        [...params, limit, offset]
      );

      return {
        orders: ordersResult.rows,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update shipping information (admin)
   */
  async updateShippingInfo(orderId, trackingNumber, shippingMethod = null) {
    const client = await pool.connect();
    try {
      const updateFields = ['tracking_number = $1', 'updated_at = CURRENT_TIMESTAMP'];
      const params = [trackingNumber];

      if (shippingMethod) {
        updateFields.push('shipping_method = $2');
        params.push(shippingMethod);
      }

      await client.query(
        `UPDATE orders SET ${updateFields.join(', ')} WHERE id = $${params.length + 1}`,
        [...params, orderId]
      );

      return await this.getOrderById(orderId);
    } finally {
      client.release();
    }
  }

  /**
   * Process refund (admin)
   */
  async refundOrder(orderId, refundAmount, reason, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get order
      const orderResult = await client.query(
        `SELECT * FROM orders WHERE id = $1`,
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = orderResult.rows[0];
      const totalAmount = parseFloat(order.total_amount);

      // Determine payment status
      let paymentStatus;
      if (refundAmount >= totalAmount) {
        paymentStatus = 'refunded';
      } else {
        paymentStatus = 'partially_refunded';
      }

      // Update order
      await client.query(
        `UPDATE orders 
         SET payment_status = $1, 
             status = CASE WHEN $2 = 'refunded' THEN 'refunded' ELSE status END,
             admin_notes = COALESCE(admin_notes || E'\n', '') || $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [paymentStatus, paymentStatus, `Refund: $${refundAmount} - ${reason}`, orderId]
      );

      // Add to status history
      await this.addStatusHistory(
        orderId,
        order.payment_status,
        paymentStatus,
        userId,
        `Refunded $${refundAmount}: ${reason}`,
        client
      );

      // Restore stock if full refund
      if (paymentStatus === 'refunded') {
        const itemsResult = await client.query(
          `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
          [orderId]
        );

        for (const item of itemsResult.rows) {
          await client.query(
            `UPDATE products 
             SET stock_quantity = stock_quantity + $1,
                 sales_count = GREATEST(0, sales_count - $2)
             WHERE id = $3`,
            [item.quantity, item.quantity, item.product_id]
          );
        }
      }

      await client.query('COMMIT');

      return await this.getOrderById(orderId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reorder - Add items from previous order to cart
   */
  async reorderFromOrder(orderId, userId) {
    const client = await pool.connect();
    try {
      // Get order and verify ownership
      const order = await this.getOrderById(orderId, userId);

      if (!order || !order.items || order.items.length === 0) {
        throw new Error('Order not found or has no items');
      }

      // Add each item to cart
      for (const item of order.items) {
        try {
          await cartService.addToCart(
            userId,
            item.product_id,
            item.quantity,
            item.selected_attributes || {}
          );
        } catch (error) {
          // Log but continue if a product is no longer available
          console.warn(`Could not add product ${item.product_id} to cart:`, error.message);
        }
      }

      return { success: true };
    } finally {
      client.release();
    }
  }

  /**
   * Get order statistics (admin)
   */
  async getOrderStats() {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT
          COUNT(*) as total_orders,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_orders,
          COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_orders,
          COUNT(*) FILTER (WHERE status = 'processing') as processing_orders,
          COUNT(*) FILTER (WHERE status = 'shipped') as shipped_orders,
          COUNT(*) FILTER (WHERE status = 'delivered') as delivered_orders,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders,
          COUNT(*) FILTER (WHERE status = 'refunded') as refunded_orders,
          COUNT(*) FILTER (WHERE payment_status = 'paid') as paid_orders,
          COUNT(*) FILTER (WHERE payment_status = 'pending') as payment_pending_orders,
          COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0) as total_revenue,
          COALESCE(AVG(total_amount) FILTER (WHERE payment_status = 'paid'), 0) as average_order_value,
          COUNT(DISTINCT user_id) as unique_customers
        FROM orders
      `);

      return result.rows[0];
    } finally {
      client.release();
    }
  }
}

module.exports = new OrderService();
