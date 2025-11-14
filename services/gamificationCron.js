// services/gamificationCron.js
const leaderboardService = require('./leaderboardService');
const gamificationService = require('./gamificationService');

class GamificationCron {
  constructor() {
    this.intervals = [];
  }

  // Start all cron jobs
  start() {
    console.log('🎮 Starting gamification cron jobs...');

    // Update leaderboards every hour
    const leaderboardInterval = setInterval(async () => {
      try {
        const enabled = await gamificationService.isEnabled();
        if (enabled) {
          console.log('⏰ Running scheduled leaderboard update...');
          await leaderboardService.updateAllLeaderboards();
        }
      } catch (err) {
        console.error('Error in leaderboard cron:', err);
      }
    }, 60 * 60 * 1000); // 1 hour

    this.intervals.push(leaderboardInterval);

    // Run initial update after 30 seconds
    setTimeout(async () => {
      try {
        const enabled = await gamificationService.isEnabled();
        if (enabled) {
          console.log('🚀 Running initial leaderboard update...');
          await leaderboardService.updateAllLeaderboards();
        }
      } catch (err) {
        console.error('Error in initial leaderboard update:', err);
      }
    }, 30000);

    console.log('✅ Gamification cron jobs started');
  }

  // Stop all cron jobs
  stop() {
    console.log('🛑 Stopping gamification cron jobs...');
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    console.log('✅ Gamification cron jobs stopped');
  }
}

module.exports = new GamificationCron();
