// Seed initial gamification data
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../db');

async function seedData() {
  console.log('🌱 Seeding Gamification Data...\n');
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // ============================================
    // 1. SEED XP RULES
    // ============================================
    console.log('📋 Seeding XP Rules...');
    
    const xpRules = [
      // Social Activity XP
      { action: 'post_created', xp: 15, entity: 'Post', category: 'social', desc: 'Create a post' },
      { action: 'comment_created', xp: 5, entity: 'Comment', category: 'social', desc: 'Comment on a post' },
      { action: 'like_given', xp: 1, entity: 'Post', category: 'social', desc: 'Like another post' },
      { action: 'like_received', xp: 2, entity: 'Post', category: 'social', desc: 'Receive a like on your post' },
      { action: 'comment_received', xp: 3, entity: 'Post', category: 'social', desc: 'Receive a comment on your post' },
      { action: 'follow_given', xp: 1, entity: 'User', category: 'social', desc: 'Follow another user' },
      { action: 'follower_received', xp: 8, entity: 'User', category: 'social', desc: 'Receive a follower' },
      
      // Marketplace Activity XP
      { action: 'product_created', xp: 20, entity: 'Product', category: 'marketplace', desc: 'Create a product listing' },
      { action: 'product_updated', xp: 5, entity: 'Product', category: 'marketplace', desc: 'Update a product listing' },
      { action: 'message_received_seller', xp: 3, entity: 'Message', category: 'marketplace', desc: 'Seller receives a message' },
      { action: 'message_sent_buyer', xp: 2, entity: 'Message', category: 'marketplace', desc: 'Buyer messages seller' },
      { action: 'product_sold', xp: 30, entity: 'Product', category: 'marketplace', desc: 'Mark item as sold' },
      { action: 'feedback_given', xp: 10, entity: 'Feedback', category: 'marketplace', desc: 'Buyer leaves feedback' },
      { action: 'feedback_received_positive', xp: 25, entity: 'Feedback', category: 'marketplace', desc: 'Seller receives positive feedback' },
      
      // Daily Bonuses
      { action: 'daily_login', xp: 5, entity: 'System', category: 'daily_bonus', desc: 'Daily login (base)', max_per_day: 1 },
      { action: 'daily_login_streak_3', xp: 10, entity: 'System', category: 'daily_bonus', desc: '3-day streak bonus', max_per_day: 1 },
      { action: 'daily_login_streak_7', xp: 20, entity: 'System', category: 'daily_bonus', desc: '7-day streak bonus', max_per_day: 1 },
      { action: 'daily_actions_complete', xp: 10, entity: 'System', category: 'daily_bonus', desc: 'Complete 3 actions in a day', max_per_day: 1 },
      
      // Weekly Bonuses
      { action: 'weekly_consistency', xp: 50, entity: 'System', category: 'weekly_bonus', desc: 'Active 5+ days in a week' },
    ];
    
    for (const rule of xpRules) {
      await client.query(`
        INSERT INTO xp_rules (action_type, xp_amount, entity_type, category, description, max_per_day)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (action_type) DO NOTHING
      `, [rule.action, rule.xp, rule.entity, rule.category, rule.desc, rule.max_per_day || null]);
    }
    
    console.log(`✅ Seeded ${xpRules.length} XP rules\n`);
    
    // ============================================
    // 2. SEED BADGES
    // ============================================
    console.log('🎖  Seeding Badges...');
    
    const badges = [
      // Social Badges
      {
        name: 'Content Creator',
        slug: 'content-creator',
        desc: 'Created 50 posts',
        category: 'social',
        rarity: 'rare',
        criteria: { type: 'post_count', threshold: 50 },
        benefits: { profile_badge: true }
      },
      {
        name: 'Top Commenter',
        slug: 'top-commenter',
        desc: 'Made 200 comments',
        category: 'social',
        rarity: 'rare',
        criteria: { type: 'comment_count', threshold: 200 },
        benefits: { profile_badge: true }
      },
      {
        name: 'Popular User',
        slug: 'popular-user',
        desc: 'Received 1000+ likes',
        category: 'social',
        rarity: 'epic',
        criteria: { type: 'likes_received', threshold: 1000 },
        benefits: { extra_feed_visibility: true }
      },
      
      // Marketplace Badges
      {
        name: 'Trusted Seller',
        slug: 'trusted-seller',
        desc: 'Received 10 positive feedbacks',
        category: 'marketplace',
        rarity: 'epic',
        criteria: { type: 'positive_feedback_count', threshold: 10 },
        benefits: { buyer_trust_boost: true, icon: 'verified' }
      },
      {
        name: 'Power Seller',
        slug: 'power-seller',
        desc: 'Completed 50 successful sales',
        category: 'marketplace',
        rarity: 'legendary',
        criteria: { type: 'completed_sales', threshold: 50 },
        benefits: { higher_search_ranking: true }
      },
      {
        name: 'Fast Responder',
        slug: 'fast-responder',
        desc: 'Average response time under 5 minutes',
        category: 'marketplace',
        rarity: 'rare',
        criteria: { type: 'avg_response_time', threshold: 5 },
        benefits: { special_chat_icon: true }
      },
      {
        name: 'Verified Seller',
        slug: 'verified-seller',
        desc: 'Uploaded ID verification',
        category: 'marketplace',
        rarity: 'epic',
        criteria: { type: 'id_verified', threshold: 1 },
        benefits: { verified_checkmark: true }
      },
      
      // Engagement Badges
      {
        name: '7-Day Streak',
        slug: '7-day-streak',
        desc: 'Logged in for 7 consecutive days',
        category: 'engagement',
        rarity: 'common',
        criteria: { type: 'login_streak', threshold: 7 },
        benefits: {}
      },
      {
        name: 'Monthly Active',
        slug: 'monthly-active',
        desc: 'Active for 20+ days in a month',
        category: 'engagement',
        rarity: 'rare',
        criteria: { type: 'monthly_active_days', threshold: 20 },
        benefits: {}
      },
      {
        name: 'Top Supporter',
        slug: 'top-supporter',
        desc: 'Given 500 likes',
        category: 'engagement',
        rarity: 'rare',
        criteria: { type: 'likes_given', threshold: 500 },
        benefits: {}
      },
      {
        name: 'Community Booster',
        slug: 'community-booster',
        desc: 'Reported 5 fake posts',
        category: 'engagement',
        rarity: 'epic',
        criteria: { type: 'reports_submitted', threshold: 5 },
        benefits: { community_helper: true }
      },
      
      // Rarity Badges
      {
        name: 'Early Bird',
        slug: 'early-bird',
        desc: 'Joined before launch date',
        category: 'rarity',
        rarity: 'legendary',
        criteria: { type: 'joined_before', date: '2025-01-01' },
        benefits: { exclusive: true }
      },
      {
        name: 'Legend',
        slug: 'legend',
        desc: 'Reached level 50',
        category: 'rarity',
        rarity: 'legendary',
        criteria: { type: 'level', threshold: 50 },
        benefits: { legendary_status: true }
      },
      {
        name: 'Collector',
        slug: 'collector',
        desc: 'Saved 100 listings',
        category: 'rarity',
        rarity: 'rare',
        criteria: { type: 'bookmarks_count', threshold: 100 },
        benefits: {}
      },
    ];
    
    for (const badge of badges) {
      await client.query(`
        INSERT INTO badges (name, slug, description, category, rarity, criteria, benefits)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (slug) DO NOTHING
      `, [
        badge.name,
        badge.slug,
        badge.desc,
        badge.category,
        badge.rarity,
        JSON.stringify(badge.criteria),
        JSON.stringify(badge.benefits)
      ]);
    }
    
    console.log(`✅ Seeded ${badges.length} badges\n`);
    
    await client.query('COMMIT');
    
    console.log('🎉 Gamification data seeded successfully!\n');
    
    // Show summary
    const xpCount = await client.query('SELECT COUNT(*) FROM xp_rules');
    const badgeCount = await client.query('SELECT COUNT(*) FROM badges');
    
    console.log('📊 Summary:');
    console.log(`   • XP Rules: ${xpCount.rows[0].count}`);
    console.log(`   • Badges: ${badgeCount.rows[0].count}\n`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedData();
