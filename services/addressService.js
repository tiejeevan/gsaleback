// services/addressService.js
const pool = require('../db');

class AddressService {
  /**
   * Get all addresses for a user
   */
  async getUserAddresses(userId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM user_addresses 
         WHERE user_id = $1 
         ORDER BY is_default DESC, created_at DESC`,
        [userId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get single address by ID
   */
  async getAddressById(addressId, userId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM user_addresses WHERE id = $1 AND user_id = $2`,
        [addressId, userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Address not found');
      }

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Get default address for user
   */
  async getDefaultAddress(userId, addressType = 'shipping') {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM user_addresses 
         WHERE user_id = $1 
         AND (address_type = $2 OR address_type = 'both')
         AND is_default = true
         LIMIT 1`,
        [userId, addressType]
      );

      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * Create new address
   */
  async createAddress(userId, addressData) {
    const {
      address_type = 'shipping',
      label,
      name,
      phone,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country = 'United States',
      is_default = false
    } = addressData;

    const client = await pool.connect();
    try {
      // Validate required fields
      if (!name || !phone || !address_line1 || !city || !state || !postal_code) {
        throw new Error('Missing required address fields');
      }

      const result = await client.query(
        `INSERT INTO user_addresses (
          user_id, address_type, label, name, phone,
          address_line1, address_line2, city, state, postal_code, country, is_default
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          userId, address_type, label, name, phone,
          address_line1, address_line2, city, state, postal_code, country, is_default
        ]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Update address
   */
  async updateAddress(addressId, userId, addressData) {
    const client = await pool.connect();
    try {
      // Verify ownership
      await this.getAddressById(addressId, userId);

      const {
        address_type,
        label,
        name,
        phone,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country,
        is_default
      } = addressData;

      const result = await client.query(
        `UPDATE user_addresses SET
          address_type = COALESCE($1, address_type),
          label = COALESCE($2, label),
          name = COALESCE($3, name),
          phone = COALESCE($4, phone),
          address_line1 = COALESCE($5, address_line1),
          address_line2 = COALESCE($6, address_line2),
          city = COALESCE($7, city),
          state = COALESCE($8, state),
          postal_code = COALESCE($9, postal_code),
          country = COALESCE($10, country),
          is_default = COALESCE($11, is_default),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $12 AND user_id = $13
         RETURNING *`,
        [
          address_type, label, name, phone, address_line1, address_line2,
          city, state, postal_code, country, is_default, addressId, userId
        ]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Set address as default
   */
  async setDefaultAddress(addressId, userId) {
    const client = await pool.connect();
    try {
      // Verify ownership
      const address = await this.getAddressById(addressId, userId);

      const result = await client.query(
        `UPDATE user_addresses SET
          is_default = true,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [addressId, userId]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Delete address
   */
  async deleteAddress(addressId, userId) {
    const client = await pool.connect();
    try {
      // Verify ownership
      await this.getAddressById(addressId, userId);

      await client.query(
        `DELETE FROM user_addresses WHERE id = $1 AND user_id = $2`,
        [addressId, userId]
      );

      return { success: true };
    } finally {
      client.release();
    }
  }

  /**
   * Convert address to order format
   */
  addressToOrderFormat(address) {
    return {
      name: address.name,
      phone: address.phone,
      address: address.address_line1,
      address2: address.address_line2,
      city: address.city,
      state: address.state,
      zip: address.postal_code,
      country: address.country
    };
  }
}

module.exports = new AddressService();
