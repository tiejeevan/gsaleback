// routes/gamification.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const gamificationService = require('../services/gamificationService');
const xpService = require('../services/xpService');
const badgeService = require('../services/badgeService');
const leaderboardService = require('../services/leaderboardService');
const reputationService = require('../services/reputationService');
const eventService = require('../services/eventService');

// Get current user's gamification profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const profile = await gamificationService.getUserProfile(req.user.id);
    res.json(profile);
  } catch (err) {
    console.error('Error fetching gamification profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get user gamification profile by ID
router.get('/profile/:userId', authMiddleware, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const profile = await gamificationService.getUserProfile(userId);
    res.json(profile);
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get XP history
router.get('/xp/history', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = await xpService.getUserXPHistory(req.user.id, limit);
    res.json(history);
  } catch (err) {
    console.error('Error fetching XP history:', err);
    res.status(500).json({ error: 'Failed to fetch XP history' });
  }
});

// Get XP breakdown
router.get('/xp/breakdown', authMiddleware, async (req, res) => {
  try {
    const breakdown = await xpService.getXPBreakdown(req.user.id);
    res.json(breakdown);
  } catch (err) {
    console.error('Error fetching XP breakdown:', err);
    res.status(500).json({ error: 'Failed to fetch XP breakdown' });
  }
});

// Get all available badges
router.get('/badges', authMiddleware, async (req, res) => {
  try {
    const badges = await badgeService.getAllBadges();
    res.json(badges);
  } catch (err) {
    console.error('Error fetching badges:', err);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

// Get user's badges
router.get('/badges/me', authMiddleware, async (req, res) => {
  try {
    const badges = await badgeService.getUserBadges(req.user.id);
    res.json(badges);
  } catch (err) {
    console.error('Error fetching user badges:', err);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

// Get badge progress
router.get('/badges/:badgeId/progress', authMiddleware, async (req, res) => {
  try {
    const badgeId = parseInt(req.params.badgeId);
    const progress = await badgeService.getBadgeProgress(req.user.id, badgeId);
    res.json(progress);
  } catch (err) {
    console.error('Error fetching badge progress:', err);
    res.status(500).json({ error: 'Failed to fetch badge progress' });
  }
});

// Get leaderboards
router.get('/leaderboards', authMiddleware, async (req, res) => {
  try {
    const type = req.query.type || 'top_level';
    const limit = parseInt(req.query.limit) || 50;
    const leaderboard = await leaderboardService.getLeaderboard(type, limit);
    res.json(leaderboard);
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get leaderboard types
router.get('/leaderboards/types', authMiddleware, async (req, res) => {
  try {
    const types = leaderboardService.getLeaderboardTypes();
    res.json(types);
  } catch (err) {
    console.error('Error fetching leaderboard types:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard types' });
  }
});

// Get user's rank in leaderboard
router.get('/leaderboards/:type/rank', authMiddleware, async (req, res) => {
  try {
    const type = req.params.type;
    const rank = await leaderboardService.getUserRank(req.user.id, type);
    res.json(rank || { rank: null, score: 0 });
  } catch (err) {
    console.error('Error fetching user rank:', err);
    res.status(500).json({ error: 'Failed to fetch rank' });
  }
});

// Get user reputation
router.get('/reputation', authMiddleware, async (req, res) => {
  try {
    const reputation = await reputationService.getUserReputation(req.user.id);
    res.json(reputation);
  } catch (err) {
    console.error('Error fetching reputation:', err);
    res.status(500).json({ error: 'Failed to fetch reputation' });
  }
});

// Get active events
router.get('/events', authMiddleware, async (req, res) => {
  try {
    const events = await eventService.getActiveEvents();
    res.json(events);
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Claim daily login bonus
router.post('/claim-daily-bonus', authMiddleware, async (req, res) => {
  try {
    const io = req.app.get('io');
    const result = await xpService.awardXP(req.user.id, 'daily_login', null, {}, io);
    
    if (!result) {
      return res.status(400).json({ error: 'Daily bonus already claimed or not available' });
    }

    res.json(result);
  } catch (err) {
    console.error('Error claiming daily bonus:', err);
    res.status(500).json({ error: 'Failed to claim daily bonus' });
  }
});

// TEST ENDPOINT: Manually trigger XP notification
router.post('/test-xp-notification', authMiddleware, async (req, res) => {
  try {
    const io = req.app.get('io');
    const userId = req.user.id;
    
    console.log('🧪 TEST: Triggering XP notification for user:', userId);
    console.log('🧪 TEST: io available:', !!io);
    
    if (io) {
      const roomName = `user_${userId}`;
      const testData = {
        xpAmount: 25,
        actionType: 'test',
        totalXP: 100,
        currentLevel: 2
      };
      
      console.log(`🧪 TEST: Emitting to room '${roomName}' with data:`, testData);
      io.to(roomName).emit('xp:earned', testData);
      console.log('🧪 TEST: Event emitted successfully');
      
      res.json({ 
        success: true, 
        message: 'Test XP notification sent',
        roomName,
        data: testData
      });
    } else {
      res.status(500).json({ error: 'Socket.IO not available' });
    }
  } catch (err) {
    console.error('🧪 TEST: Error:', err);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

module.exports = router;
