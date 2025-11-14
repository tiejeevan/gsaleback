// services/searchService.js
const Fuse = require('fuse.js');
const pool = require('../db');

class SearchService {
  /**
   * Search products with Fuse.js (fuzzy search)
   * @param {string} query - Search query
   * @param {object} filters - Additional filters (category, price range, etc.)
   * @param {number} limit - Max results to return
   */
  async searchProducts(query, filters = {}, limit = 10) {
    try {
      // First, get all active products from database with basic filters
      const { category_id, min_price, max_price, status = 'active' } = filters;
      
      let whereConditions = ['p.deleted_at IS NULL', `p.status = $1`];
      let params = [status];
      let paramCount = 1;

      if (category_id) {
        paramCount++;
        whereConditions.push(`p.category_id = $${paramCount}`);
        params.push(category_id);
      }

      if (min_price) {
        paramCount++;
        whereConditions.push(`p.price >= $${paramCount}`);
        params.push(min_price);
      }

      if (max_price) {
        paramCount++;
        whereConditions.push(`p.price <= $${paramCount}`);
        params.push(max_price);
      }

      const whereClause = whereConditions.join(' AND ');

      // Fetch products from database
      const result = await pool.query(
        `SELECT 
          p.*,
          c.name as category_name,
          c.slug as category_slug,
          u.id as user_id,
          u.username as user_username,
          u.first_name as user_first_name,
          u.last_name as user_last_name,
          u.profile_image as user_profile_image
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN users u ON p.created_by = u.id
        WHERE ${whereClause}
        LIMIT 1000`,
        params
      );

      const products = result.rows;

      // If no query, return first N products
      if (!query || query.trim() === '') {
        return products.slice(0, limit);
      }

      // Configure Fuse.js for fuzzy search
      const fuseOptions = {
        keys: [
          { name: 'title', weight: 0.5 },           // Title is most important
          { name: 'description', weight: 0.2 },     // Description is secondary
          { name: 'short_description', weight: 0.15 },
          { name: 'brand', weight: 0.1 },
          { name: 'category_name', weight: 0.05 },
        ],
        threshold: 0.4,           // 0.0 = perfect match, 1.0 = match anything
        distance: 100,            // How far to search for matches
        minMatchCharLength: 2,    // Minimum characters to start matching
        includeScore: true,       // Include relevance score
        useExtendedSearch: false,
        ignoreLocation: true,     // Search entire string, not just beginning
      };

      // Create Fuse instance and search
      const fuse = new Fuse(products, fuseOptions);
      const searchResults = fuse.search(query);

      // Extract items and limit results
      const results = searchResults
        .slice(0, limit)
        .map(result => ({
          ...result.item,
          searchScore: result.score, // Lower score = better match
        }));

      return results;
    } catch (error) {
      console.error('Error in searchProducts:', error);
      throw error;
    }
  }

  /**
   * Get search suggestions (typeahead)
   * Returns just titles for quick autocomplete
   */
  async getSearchSuggestions(query, limit = 5) {
    try {
      if (!query || query.trim().length < 2) {
        return [];
      }

      const products = await this.searchProducts(query, {}, limit);
      
      // Return simplified suggestions
      return products.map(p => ({
        id: p.id,
        title: p.title,
        price: p.price,
        image: p.images?.[0] || null,
        category: p.category_name,
      }));
    } catch (error) {
      console.error('Error in getSearchSuggestions:', error);
      throw error;
    }
  }
}

module.exports = new SearchService();
