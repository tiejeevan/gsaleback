// middleware/gamificationMiddleware.js
const gamificationService = require('../services/gamificationService');

// Middleware to check if gamification is enabled
module.exports = async (req, res, next) => {
  try {
    const enabled = await gamificationService.isEnabled();
    req.gamificationEnabled = enabled;
    
    // Log only for POST requests to avoid spam
    if (req.method === 'POST' && (req.path.includes('/posts') || req.path.includes('/products'))) {
      console.log(`🎮 Gamification middleware: enabled=${enabled} for ${req.method} ${req.path}`);
    }
    
    next();
  } catch (err) {
    console.error('Gamification middleware error:', err);
    req.gamificationEnabled = false;
    next();
  }
};
