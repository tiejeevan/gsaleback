const express = require('express');
const router = express.Router();
const newsService = require('../services/newsService');
const authenticateToken = require('../middleware/authMiddleware');

// Get world news
router.get('/world', authenticateToken, async (req, res) => {
  try {
    const country = req.query.country || 'us';
    const limit = parseInt(req.query.limit) || 5;
    const articles = await newsService.getWorldNews(country, limit);
    res.json(articles);
  } catch (error) {
    console.error('Error fetching world news:', error);
    res.status(500).json({ error: 'Failed to fetch world news' });
  }
});

// Get regional news
router.get('/regional', authenticateToken, async (req, res) => {
  try {
    const country = req.query.country || 'us';
    const limit = parseInt(req.query.limit) || 5;
    const articles = await newsService.getRegionalNews(country, limit);
    res.json(articles);
  } catch (error) {
    console.error('Error fetching regional news:', error);
    res.status(500).json({ error: 'Failed to fetch regional news' });
  }
});

// Get sports news
router.get('/sports', authenticateToken, async (req, res) => {
  try {
    const params = {
      country: req.query.country,
      sport: req.query.sport,
      scope: req.query.scope || 'worldwide',
      limit: parseInt(req.query.limit) || 5,
    };
    const articles = await newsService.getSportsNews(params);
    res.json(articles);
  } catch (error) {
    console.error('Error fetching sports news:', error);
    res.status(500).json({ error: 'Failed to fetch sports news' });
  }
});

// Get entertainment news
router.get('/entertainment', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const articles = await newsService.getEntertainmentNews(limit);
    res.json(articles);
  } catch (error) {
    console.error('Error fetching entertainment news:', error);
    res.status(500).json({ error: 'Failed to fetch entertainment news' });
  }
});

module.exports = router;
