// services/productsService.js
const pool = require('../db');

class ProductsService {
  // ============================================
  // PRODUCT CRUD OPERATIONS
  // ============================================

  /**
   * Create a new product
   */
  async createProduct(productData) {
    const {
      userId,
      title,
      name,
      slug,
      description,
      short_description,
      price,
      compare_at_price,
      cost_price,
      sku,
      barcode,
      category_id,
      brand,
      stock_quantity,
      low_stock_threshold,
      weight,
      dimensions,
      images,
      video_url,
      tags,
      status,
      is_featured,
      owner_type,
      owner_id,
      seo_title,
      seo_description,
      meta_keywords,
      attributes,
      media
    } = productData;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert product
      const productResult = await client.query(
        `INSERT INTO products (
          name, slug, description, short_description, price, compare_at_price, 
          cost_price, sku, barcode, category_id, brand, stock_quantity, 
          low_stock_threshold, weight, dimensions, images, video_url, tags, 
          status, is_featured, owner_type, owner_id, seo_title, seo_description, 
          meta_keywords, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 
                  $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
        RETURNING *`,
        [
          title || name, slug, description, short_description, price, compare_at_price,
          cost_price, sku, barcode, category_id, brand, stock_quantity || 0,
          low_stock_threshold || 10, weight, JSON.stringify(dimensions || {}),
          JSON.stringify(images || []), video_url, JSON.stringify(tags || []),
          status || 'draft', is_featured || false, owner_type || 'User',
          owner_id || userId, seo_title, seo_description, meta_keywords, userId
        ]
      );

      const product = productResult.rows[0];

      // Insert product attributes if provided
      if (attributes && attributes.length > 0) {
        for (const attr of attributes) {
          await client.query(
            `INSERT INTO product_attributes (product_id, key, value)
             VALUES ($1, $2, $3)`,
            [product.id, attr.key, attr.value]
          );
        }
      }

      // Insert product media if provided
      if (media && media.length > 0) {
        for (let i = 0; i < media.length; i++) {
          const mediaItem = media[i];
          await client.query(
            `INSERT INTO product_media (product_id, type, url, display_order, is_primary)
             VALUES ($1, $2, $3, $4, $5)`,
            [product.id, mediaItem.type, mediaItem.url, i, i === 0]
          );
        }
      }

      await client.query('COMMIT');

      // Fetch complete product with relations
      const completeProduct = await this.getProductById(product.id);
      
      // Return product with userId for notification creation
      return { ...completeProduct, userId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get product by ID with all relations
   */
  async getProductById(productId, includeDeleted = false) {
    const deletedCondition = includeDeleted ? '' : 'AND p.deleted_at IS NULL';
    
    const result = await pool.query(
      `SELECT 
        p.*,
        c.name as category_name,
        c.slug as category_slug,
        u.id as user_id,
        u.username as user_username,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.profile_image as user_profile_image,
        u.display_name as creator_display_name,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', pa.id,
              'key', pa.key,
              'value', pa.value
            )
          ) FILTER (WHERE pa.id IS NOT NULL), '[]'
        ) as attributes,
        COALESCE(
          (
            SELECT json_agg(
              jsonb_build_object(
                'id', pm2.id,
                'type', pm2.type,
                'url', pm2.url,
                'display_order', pm2.display_order,
                'is_primary', pm2.is_primary
              ) ORDER BY pm2.display_order
            )
            FROM product_media pm2
            WHERE pm2.product_id = p.id
          ), '[]'
        ) as media
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN product_attributes pa ON p.id = pa.product_id
      WHERE p.id = $1 ${deletedCondition}
      GROUP BY p.id, c.name, c.slug, u.id, u.username, u.first_name, u.last_name, u.profile_image, u.display_name`,
      [productId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all products with filters and pagination
   */
  async getProducts(filters = {}) {
    const {
      page = 1,
      limit = 20,
      status,
      category_id,
      owner_type,
      owner_id,
      created_by,
      is_featured,
      search,
      min_price,
      max_price,
      tags,
      sort_by = 'created_at',
      sort_order = 'DESC',
      include_deleted = false
    } = filters;

    const offset = (page - 1) * limit;
    const conditions = [];
    
    // Only filter out deleted products if not explicitly including them
    if (!include_deleted) {
      conditions.push('p.deleted_at IS NULL');
    }
    
    const params = [];
    let paramCount = 0;

    // Build WHERE conditions
    if (status) {
      paramCount++;
      conditions.push(`p.status = $${paramCount}`);
      params.push(status);
    }

    if (category_id) {
      paramCount++;
      conditions.push(`p.category_id = $${paramCount}`);
      params.push(category_id);
    }

    if (owner_type) {
      paramCount++;
      conditions.push(`p.owner_type = $${paramCount}`);
      params.push(owner_type);
    }

    if (owner_id) {
      paramCount++;
      conditions.push(`p.owner_id = $${paramCount}`);
      params.push(owner_id);
    }

    if (created_by) {
      paramCount++;
      conditions.push(`p.created_by = $${paramCount}`);
      params.push(created_by);
    }

    if (is_featured !== undefined) {
      paramCount++;
      conditions.push(`p.is_featured = $${paramCount}`);
      params.push(is_featured);
    }

    if (search) {
      paramCount++;
      conditions.push(`(
        to_tsvector('english', p.name || ' ' || COALESCE(p.description, '')) 
        @@ plainto_tsquery('english', $${paramCount})
        OR p.name ILIKE $${paramCount + 1}
      )`);
      params.push(search, `%${search}%`);
      paramCount++;
    }

    if (min_price) {
      paramCount++;
      conditions.push(`p.price >= $${paramCount}`);
      params.push(min_price);
    }

    if (max_price) {
      paramCount++;
      conditions.push(`p.price <= $${paramCount}`);
      params.push(max_price);
    }

    if (tags && tags.length > 0) {
      paramCount++;
      conditions.push(`p.tags ?| $${paramCount}`);
      params.push(tags);
    }

    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

    // Validate sort column
    const validSortColumns = ['created_at', 'updated_at', 'price', 'name', 'views_count', 'sales_count', 'rating_average'];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM products p WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get products
    params.push(limit, offset);
    const result = await pool.query(
      `SELECT 
        p.*,
        c.name as category_name,
        c.slug as category_slug,
        u.id as user_id,
        u.username as user_username,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.profile_image as user_profile_image,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', pm.id,
              'type', pm.type,
              'url', pm.url,
              'is_primary', pm.is_primary
            )
          ) FILTER (WHERE pm.id IS NOT NULL AND pm.is_primary = true), '[]'
        ) as primary_media
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN product_media pm ON p.id = pm.product_id
      WHERE ${whereClause}
      GROUP BY p.id, c.name, c.slug, u.id, u.username, u.first_name, u.last_name, u.profile_image
      ORDER BY p.${sortColumn} ${sortDirection}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      params
    );

    return {
      products: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Update product
   */
  async updateProduct(productId, userId, updateData, isAdmin = false) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check ownership
      const ownerCheck = await client.query(
        'SELECT created_by, owner_id FROM products WHERE id = $1 AND deleted_at IS NULL',
        [productId]
      );

      if (ownerCheck.rows.length === 0) {
        throw new Error('Product not found');
      }

      if (!isAdmin && ownerCheck.rows[0].created_by !== userId && ownerCheck.rows[0].owner_id !== userId) {
        throw new Error('Unauthorized to update this product');
      }

      // Build update query dynamically
      const allowedFields = [
        'name', 'slug', 'description', 'short_description', 'price', 
        'compare_at_price', 'cost_price', 'sku', 'barcode', 'category_id', 
        'brand', 'stock_quantity', 'low_stock_threshold', 'weight', 
        'dimensions', 'images', 'video_url', 'tags', 'status', 'is_featured',
        'seo_title', 'seo_description', 'meta_keywords'
      ];

      const updates = [];
      const values = [];
      let paramCount = 0;

      // Handle title -> name mapping
      if (updateData.title && !updateData.name) {
        updateData.name = updateData.title;
      }

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          paramCount++;
          updates.push(`${field} = $${paramCount}`);
          
          // Handle JSON fields
          if (['dimensions', 'images', 'tags'].includes(field)) {
            values.push(JSON.stringify(updateData[field]));
          } else {
            values.push(updateData[field]);
          }
        }
      }

      if (updates.length === 0) {
        throw new Error('No valid fields to update');
      }

      paramCount++;
      values.push(productId);

      const result = await client.query(
        `UPDATE products 
         SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramCount} AND deleted_at IS NULL
         RETURNING *`,
        values
      );

      // Update attributes if provided
      if (updateData.attributes) {
        // Delete existing attributes
        await client.query('DELETE FROM product_attributes WHERE product_id = $1', [productId]);
        
        // Insert new attributes
        for (const attr of updateData.attributes) {
          await client.query(
            'INSERT INTO product_attributes (product_id, key, value) VALUES ($1, $2, $3)',
            [productId, attr.key, attr.value]
          );
        }
      }

      // Update media if provided
      if (updateData.media) {
        // Delete existing media
        await client.query('DELETE FROM product_media WHERE product_id = $1', [productId]);
        
        // Insert new media
        for (let i = 0; i < updateData.media.length; i++) {
          const mediaItem = updateData.media[i];
          await client.query(
            'INSERT INTO product_media (product_id, type, url, display_order, is_primary) VALUES ($1, $2, $3, $4, $5)',
            [productId, mediaItem.type, mediaItem.url, i, i === 0]
          );
        }
      }

      await client.query('COMMIT');

      return await this.getProductById(productId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete product (soft delete)
   */
  async deleteProduct(productId, userId, isAdmin = false) {
    // Check ownership
    const ownerCheck = await pool.query(
      'SELECT created_by, owner_id FROM products WHERE id = $1 AND deleted_at IS NULL',
      [productId]
    );

    if (ownerCheck.rows.length === 0) {
      throw new Error('Product not found');
    }

    if (!isAdmin && ownerCheck.rows[0].created_by !== userId && ownerCheck.rows[0].owner_id !== userId) {
      throw new Error('Unauthorized to delete this product');
    }

    const result = await pool.query(
      'UPDATE products SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [productId]
    );

    return result.rows[0];
  }

  /**
   * Restore deleted product
   */
  async restoreProduct(productId) {
    const result = await pool.query(
      'UPDATE products SET deleted_at = NULL WHERE id = $1 RETURNING *',
      [productId]
    );

    if (result.rows.length === 0) {
      throw new Error('Product not found');
    }

    return result.rows[0];
  }

  /**
   * Permanently delete product
   */
  async permanentlyDeleteProduct(productId) {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 RETURNING *',
      [productId]
    );

    if (result.rows.length === 0) {
      throw new Error('Product not found');
    }

    return result.rows[0];
  }

  // ============================================
  // PRODUCT ACTIONS
  // ============================================

  /**
   * Increment product views
   */
  async incrementViews(productId) {
    await pool.query(
      'UPDATE products SET views_count = views_count + 1 WHERE id = $1',
      [productId]
    );
  }

  /**
   * Update product stock
   */
  async updateStock(productId, quantity, operation = 'set') {
    let query;
    if (operation === 'increment') {
      query = 'UPDATE products SET stock_quantity = stock_quantity + $2 WHERE id = $1 RETURNING *';
    } else if (operation === 'decrement') {
      query = 'UPDATE products SET stock_quantity = GREATEST(stock_quantity - $2, 0) WHERE id = $1 RETURNING *';
    } else {
      query = 'UPDATE products SET stock_quantity = $2 WHERE id = $1 RETURNING *';
    }

    const result = await pool.query(query, [productId, quantity]);
    return result.rows[0];
  }

  /**
   * Get products by owner
   */
  async getProductsByOwner(ownerType, ownerId, filters = {}) {
    return await this.getProducts({
      ...filters,
      owner_type: ownerType,
      owner_id: ownerId
    });
  }

  /**
   * Get featured products
   */
  async getFeaturedProducts(limit = 10) {
    const result = await pool.query(
      `SELECT 
        p.*,
        c.name as category_name,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'url', pm.url,
              'type', pm.type
            )
          ) FILTER (WHERE pm.id IS NOT NULL AND pm.is_primary = true), '[]'
        ) as primary_media
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_media pm ON p.id = pm.product_id
      WHERE p.is_featured = true 
        AND p.status = 'active' 
        AND p.deleted_at IS NULL
      GROUP BY p.id, c.name
      ORDER BY p.created_at DESC
      LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  // ============================================
  // CATEGORY OPERATIONS
  // ============================================

  /**
   * Create category
   */
  async createCategory(categoryData) {
    const { name, slug, description, image_url, parent_id } = categoryData;

    const result = await pool.query(
      `INSERT INTO categories (name, slug, description, image_url, parent_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, slug, description, image_url, parent_id]
    );

    return result.rows[0];
  }

  /**
   * Get all categories
   */
  async getCategories(includeInactive = false) {
    const condition = includeInactive ? '' : 'WHERE is_active = true';
    
    const result = await pool.query(
      `SELECT 
        c.*,
        COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.deleted_at IS NULL AND p.status = 'active'
      ${condition}
      GROUP BY c.id
      ORDER BY c.name ASC`
    );

    return result.rows;
  }

  /**
   * Get category by ID with products
   */
  async getCategoryById(categoryId, productFilters = {}) {
    const category = await pool.query(
      'SELECT * FROM categories WHERE id = $1',
      [categoryId]
    );

    if (category.rows.length === 0) {
      throw new Error('Category not found');
    }

    // Get products in this category
    const products = await this.getProducts({
      ...productFilters,
      category_id: categoryId
    });

    return {
      ...category.rows[0],
      products: products.products,
      pagination: products.pagination
    };
  }

  /**
   * Update category
   */
  async updateCategory(categoryId, updateData) {
    const allowedFields = ['name', 'slug', 'description', 'image_url', 'parent_id', 'is_active'];
    const updates = [];
    const values = [];
    let paramCount = 0;

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        paramCount++;
        updates.push(`${field} = $${paramCount}`);
        values.push(updateData[field]);
      }
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    paramCount++;
    values.push(categoryId);

    const result = await pool.query(
      `UPDATE categories 
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Delete category
   */
  async deleteCategory(categoryId) {
    // Check if category has products
    const productCheck = await pool.query(
      'SELECT COUNT(*) as count FROM products WHERE category_id = $1 AND deleted_at IS NULL',
      [categoryId]
    );

    if (parseInt(productCheck.rows[0].count) > 0) {
      throw new Error('Cannot delete category with existing products');
    }

    const result = await pool.query(
      'DELETE FROM categories WHERE id = $1 RETURNING *',
      [categoryId]
    );

    if (result.rows.length === 0) {
      throw new Error('Category not found');
    }

    return result.rows[0];
  }

  // ============================================
  // ADMIN OPERATIONS
  // ============================================

  /**
   * Get products pending approval
   */
  async getPendingProducts(page = 1, limit = 20) {
    return await this.getProducts({
      page,
      limit,
      status: 'pending',
      sort_by: 'created_at',
      sort_order: 'ASC'
    });
  }

  /**
   * Approve product
   */
  async approveProduct(productId, adminId) {
    const result = await pool.query(
      `UPDATE products 
       SET status = 'active', 
           is_verified = true, 
           approved_by = $2, 
           approved_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [productId, adminId]
    );

    if (result.rows.length === 0) {
      throw new Error('Product not found');
    }

    return result.rows[0];
  }

  /**
   * Reject product
   */
  async rejectProduct(productId, adminId) {
    const result = await pool.query(
      `UPDATE products 
       SET status = 'archived', 
           approved_by = $2, 
           approved_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [productId, adminId]
    );

    if (result.rows.length === 0) {
      throw new Error('Product not found');
    }

    return result.rows[0];
  }

  /**
   * Get product statistics
   */
  async getProductStats() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(*) FILTER (WHERE status = 'active') as active_products,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_products,
        COUNT(*) FILTER (WHERE status = 'draft') as draft_products,
        COUNT(*) FILTER (WHERE status = 'sold') as sold_products,
        COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted_products,
        COUNT(*) FILTER (WHERE is_featured = true) as featured_products,
        COUNT(DISTINCT category_id) as categories_used,
        COALESCE(AVG(price), 0) as average_price,
        COALESCE(SUM(stock_quantity), 0) as total_stock,
        COALESCE(SUM(views_count), 0) as total_views,
        COALESCE(SUM(sales_count), 0) as total_sales
      FROM products
      WHERE deleted_at IS NULL
    `);

    return result.rows[0];
  }
}

module.exports = new ProductsService();
