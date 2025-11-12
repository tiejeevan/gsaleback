// controllers/addressController.js
const addressService = require('../services/addressService');

class AddressController {
  /**
   * Get all user addresses
   * GET /api/addresses
   */
  async getUserAddresses(req, res) {
    try {
      const addresses = await addressService.getUserAddresses(req.user.id);
      res.json({
        success: true,
        addresses
      });
    } catch (error) {
      console.error('Get addresses error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get addresses',
        error: error.message
      });
    }
  }

  /**
   * Get single address
   * GET /api/addresses/:id
   */
  async getAddress(req, res) {
    try {
      const { id } = req.params;
      const address = await addressService.getAddressById(id, req.user.id);
      res.json({
        success: true,
        address
      });
    } catch (error) {
      console.error('Get address error:', error);
      res.status(404).json({
        success: false,
        message: error.message || 'Address not found'
      });
    }
  }

  /**
   * Get default address
   * GET /api/addresses/default/:type
   */
  async getDefaultAddress(req, res) {
    try {
      const { type } = req.params;
      const address = await addressService.getDefaultAddress(req.user.id, type);
      
      if (!address) {
        return res.json({
          success: true,
          address: null
        });
      }

      res.json({
        success: true,
        address
      });
    } catch (error) {
      console.error('Get default address error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get default address',
        error: error.message
      });
    }
  }

  /**
   * Create new address
   * POST /api/addresses
   */
  async createAddress(req, res) {
    try {
      const address = await addressService.createAddress(req.user.id, req.body);
      res.status(201).json({
        success: true,
        message: 'Address created successfully',
        address
      });
    } catch (error) {
      console.error('Create address error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create address'
      });
    }
  }

  /**
   * Update address
   * PUT /api/addresses/:id
   */
  async updateAddress(req, res) {
    try {
      const { id } = req.params;
      const address = await addressService.updateAddress(id, req.user.id, req.body);
      res.json({
        success: true,
        message: 'Address updated successfully',
        address
      });
    } catch (error) {
      console.error('Update address error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update address'
      });
    }
  }

  /**
   * Set address as default
   * PUT /api/addresses/:id/default
   */
  async setDefaultAddress(req, res) {
    try {
      const { id } = req.params;
      const address = await addressService.setDefaultAddress(id, req.user.id);
      res.json({
        success: true,
        message: 'Default address updated',
        address
      });
    } catch (error) {
      console.error('Set default address error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to set default address'
      });
    }
  }

  /**
   * Delete address
   * DELETE /api/addresses/:id
   */
  async deleteAddress(req, res) {
    try {
      const { id } = req.params;
      await addressService.deleteAddress(id, req.user.id);
      res.json({
        success: true,
        message: 'Address deleted successfully'
      });
    } catch (error) {
      console.error('Delete address error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete address'
      });
    }
  }
}

module.exports = new AddressController();
