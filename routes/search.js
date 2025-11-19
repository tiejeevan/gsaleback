// routes/search.js
const express = require('express');
const router = express.Router();
const searchService = require('../services/searchService');
const authMiddleware = require('../middleware/authMiddleware');

/**
 * Search products with Fuse.js (fuzzy search)
 * GET /api/search/products?q=query&category_id=1&limit=10
 * PUBLIC - No authentication required
 */
router.get('/products', async (req, res) => {
  try {
    const { q, category_id, min_price, max_price, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        results: [],
        message: 'Query too short. Please enter at least 2 characters.',
      });
    }

    const filters = {
      category_id,
      min_price: min_price ? parseFloat(min_price) : undefined,
      max_price: max_price ? parseFloat(max_price) : undefined,
    };

    const results = await searchService.searchProducts(
      q.trim(),
      filters,
      parseInt(limit)
    );

    res.json({
      success: true,
      results,
      count: results.length,
      query: q,
    });
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search products',
    });
  }
});

/**
 * Get search suggestions (typeahead/autocomplete)
 * GET /api/search/suggestions?q=query&limit=5
 * PUBLIC - No authentication required
 */
router.get('/suggestions', async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: [],
      });
    }

    const suggestions = await searchService.getSearchSuggestions(
      q.trim(),
      parseInt(limit)
    );

    res.json({
      success: true,
      suggestions,
      count: suggestions.length,
    });
  } catch (error) {
    console.error('Error getting suggestions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get suggestions',
    });
  }
});

module.exports = router;
