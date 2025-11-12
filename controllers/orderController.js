// controllers/orderController.js
const orderService = require('../services/orderService');

class OrderController {
  // ============================================
  // USER ENDPOINTS
  // ============================================

  /**
   * Create order from cart (checkout)
   * POST /api/orders/checkout
   */
  async checkout(req, res) {
    try {
      const {
        shipping_address,
        billing_address,
        shipping_method,
        payment_method,
        customer_notes,
        tax_rate,
        shipping_amount,
        discount_amount
      } = req.body;

      // Validate required fields
      if (!shipping_address) {
        return res.status(400).json({
          success: false,
          message: 'Shipping address is required'
        });
      }

      if (!payment_method) {
        return res.status(400).json({
          success: false,
          message: 'Payment method is required'
        });
      }

      // Validate shipping address structure
      const requiredAddressFields = ['name', 'address', 'city', 'state', 'zip', 'country', 'phone'];
      for (const field of requiredAddressFields) {
        if (!shipping_address[field]) {
          return res.status(400).json({
            success: false,
            message: `Shipping address ${field} is required`
          });
        }
      }

      const order = await orderService.createOrder(req.user.id, {
        shipping_address,
        billing_address,
        shipping_method,
        payment_method,
        customer_notes,
        tax_rate,
        shipping_amount,
        discount_amount
      });

      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        order
      });
    } catch (error) {
      console.error('Checkout error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create order'
      });
    }
  }

  /**
   * Get user's orders
   * GET /api/orders
   */
  async getUserOrders(req, res) {
    try {
      const filters = {
        status: req.query.status,
        payment_status: req.query.payment_status,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sort_by: req.query.sort_by || 'created_at',
        sort_order: req.query.sort_order || 'DESC'
      };

      const result = await orderService.getUserOrders(req.user.id, filters);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Get user orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get orders',
        error: error.message
      });
    }
  }

  /**
   * Get single order details
   * GET /api/orders/:id
   */
  async getOrder(req, res) {
    try {
      const { id } = req.params;
      const order = await orderService.getOrderById(id, req.user.id);

      res.json({
        success: true,
        order
      });
    } catch (error) {
      console.error('Get order error:', error);
      res.status(404).json({
        success: false,
        message: error.message || 'Order not found'
      });
    }
  }

  /**
   * Cancel order
   * PUT /api/orders/:id/cancel
   */
  async cancelOrder(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const order = await orderService.cancelOrder(id, req.user.id, reason);

      res.json({
        success: true,
        message: 'Order cancelled successfully',
        order
      });
    } catch (error) {
      console.error('Cancel order error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to cancel order'
      });
    }
  }

  /**
   * Track order status
   * GET /api/orders/:id/track
   */
  async trackOrder(req, res) {
    try {
      const { id } = req.params;
      const order = await orderService.getOrderById(id, req.user.id);

      res.json({
        success: true,
        tracking: {
          order_number: order.order_number,
          status: order.status,
          payment_status: order.payment_status,
          tracking_number: order.tracking_number,
          shipping_method: order.shipping_method,
          created_at: order.created_at,
          confirmed_at: order.confirmed_at,
          shipped_at: order.shipped_at,
          delivered_at: order.delivered_at,
          status_history: order.status_history
        }
      });
    } catch (error) {
      console.error('Track order error:', error);
      res.status(404).json({
        success: false,
        message: error.message || 'Order not found'
      });
    }
  }

  /**
   * Reorder - Add all items from previous order to cart
   * POST /api/orders/:id/reorder
   */
  async reorder(req, res) {
    try {
      const { id } = req.params;
      await orderService.reorderFromOrder(id, req.user.id);

      res.json({
        success: true,
        message: 'Items added to cart successfully'
      });
    } catch (error) {
      console.error('Reorder error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to reorder'
      });
    }
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  /**
   * Get all orders (admin)
   * GET /api/admin/orders
   */
  async getAllOrders(req, res) {
    try {
      const filters = {
        status: req.query.status,
        payment_status: req.query.payment_status,
        user_id: req.query.user_id,
        search: req.query.search,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sort_by: req.query.sort_by || 'created_at',
        sort_order: req.query.sort_order || 'DESC'
      };

      const result = await orderService.getAllOrders(filters);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Get all orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get orders',
        error: error.message
      });
    }
  }

  /**
   * Get order statistics (admin)
   * GET /api/admin/orders/stats
   */
  async getOrderStats(req, res) {
    try {
      const stats = await orderService.getOrderStats();

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Get order stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get order statistics',
        error: error.message
      });
    }
  }

  /**
   * Update order status (admin)
   * PUT /api/admin/orders/:id/status
   */
  async updateOrderStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required'
        });
      }

      const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'failed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      const order = await orderService.updateOrderStatus(id, status, req.user.id, notes);

      res.json({
        success: true,
        message: 'Order status updated',
        order
      });
    } catch (error) {
      console.error('Update order status error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update order status'
      });
    }
  }

  /**
   * Update shipping information (admin)
   * PUT /api/admin/orders/:id/shipping
   */
  async updateShipping(req, res) {
    try {
      const { id } = req.params;
      const { tracking_number, shipping_method } = req.body;

      if (!tracking_number) {
        return res.status(400).json({
          success: false,
          message: 'Tracking number is required'
        });
      }

      const order = await orderService.updateShippingInfo(id, tracking_number, shipping_method);

      res.json({
        success: true,
        message: 'Shipping information updated',
        order
      });
    } catch (error) {
      console.error('Update shipping error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update shipping information'
      });
    }
  }

  /**
   * Process refund (admin)
   * POST /api/admin/orders/:id/refund
   */
  async refundOrder(req, res) {
    try {
      const { id } = req.params;
      const { amount, reason } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid refund amount is required'
        });
      }

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Refund reason is required'
        });
      }

      const order = await orderService.refundOrder(id, amount, reason, req.user.id);

      res.json({
        success: true,
        message: 'Refund processed successfully',
        order
      });
    } catch (error) {
      console.error('Refund order error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to process refund'
      });
    }
  }

  /**
   * Get order by ID (admin - no user restriction)
   * GET /api/admin/orders/:id
   */
  async getOrderAdmin(req, res) {
    try {
      const { id } = req.params;
      const order = await orderService.getOrderById(id);

      res.json({
        success: true,
        order
      });
    } catch (error) {
      console.error('Get order error:', error);
      res.status(404).json({
        success: false,
        message: error.message || 'Order not found'
      });
    }
  }
}

module.exports = new OrderController();
