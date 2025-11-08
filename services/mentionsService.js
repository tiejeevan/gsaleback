const pool = require('../db');

/**
 * Extract @mentions from text content
 * @param {string} content - The comment/post content
 * @returns {string[]} - Array of mentioned usernames
 */
const extractMentions = (content) => {
  if (!content) return [];
  
  // Match @username pattern (alphanumeric and underscore)
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]); // Extract username without @
  }
  
  // Remove duplicates
  return [...new Set(mentions)];
};

/**
 * Validate mentioned usernames and get their user IDs
 * @param {string[]} usernames - Array of usernames
 * @returns {Promise<Array>} - Array of {username, user_id} objects
 */
const validateMentions = async (usernames) => {
  if (!usernames || usernames.length === 0) return [];
  
  try {
    const result = await pool.query(
      `SELECT id as user_id, username 
       FROM users 
       WHERE username = ANY($1::text[])`,
      [usernames]
    );
    
    return result.rows;
  } catch (err) {
    console.error('Error validating mentions:', err);
    return [];
  }
};

/**
 * Process mentions in content and return validated mention data
 * @param {string} content - The comment/post content
 * @returns {Promise<Object>} - {mentionedUsers: Array, mentionIds: Array}
 */
const processMentions = async (content) => {
  const usernames = extractMentions(content);
  const mentionedUsers = await validateMentions(usernames);
  const mentionIds = mentionedUsers.map(u => u.user_id);
  
  return {
    mentionedUsers,
    mentionIds
  };
};

/**
 * Create mention records in comment_mentions table
 * @param {number} commentId - The comment ID
 * @param {number} mentionerUserId - User who created the mention
 * @param {number[]} mentionedUserIds - Array of mentioned user IDs
 */
const createCommentMentions = async (commentId, mentionerUserId, mentionedUserIds) => {
  if (!mentionedUserIds || mentionedUserIds.length === 0) return;
  
  try {
    const values = mentionedUserIds.map(userId => 
      `(${commentId}, ${userId}, ${mentionerUserId}, CURRENT_TIMESTAMP, false)`
    ).join(',');
    
    await pool.query(`
      INSERT INTO comment_mentions (comment_id, mentioned_user_id, mentioner_user_id, created_at, is_read)
      VALUES ${values}
      ON CONFLICT (comment_id, mentioned_user_id) DO NOTHING
    `);
  } catch (err) {
    console.error('Error creating comment mentions:', err);
  }
};

/**
 * Send notifications to mentioned users
 * @param {Object} params - Notification parameters
 */
const notifyMentionedUsers = async ({ commentId, postId, mentionerUserId, mentionedUserIds, commentText, io }) => {
  if (!mentionedUserIds || mentionedUserIds.length === 0) return;
  
  try {
    // Get mentioner username
    const mentionerRes = await pool.query(
      `SELECT username FROM users WHERE id = $1`,
      [mentionerUserId]
    );
    const mentionerUsername = mentionerRes.rows[0]?.username || 'Someone';
    
    // Create notifications for each mentioned user (except the mentioner)
    const uniqueMentionedUsers = [...new Set(mentionedUserIds)].filter(id => id !== mentionerUserId);
    
    for (const userId of uniqueMentionedUsers) {
      const notifRes = await pool.query(
        `INSERT INTO notifications (recipient_user_id, actor_user_id, type, payload, is_read, created_at)
         VALUES ($1, $2, 'mention', $3, false, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          userId,
          mentionerUserId,
          JSON.stringify({
            postId,
            commentId,
            text: commentText?.slice(0, 100),
            mentionerUsername
          })
        ]
      );
      
      // Emit real-time notification
      if (io) {
        const roomName = `user_${userId}`;
        io.to(roomName).emit('notification:new', notifRes.rows[0]);
      }
    }
  } catch (err) {
    console.error('Error notifying mentioned users:', err);
  }
};

/**
 * Get depth level of a comment in the thread
 * @param {string} path - Comment path (e.g., "1/5/12")
 * @returns {number} - Depth level (0 for top-level)
 */
const getCommentDepth = (path) => {
  if (!path) return 0;
  return path.split('/').length - 1;
};

/**
 * Check if comment is at depth where only mentions are allowed
 * @param {string} path - Comment path
 * @param {number} maxReplyDepth - Maximum depth before mentions-only (default: 1)
 * @returns {boolean}
 */
const isMentionsOnlyDepth = (path, maxReplyDepth = 1) => {
  return getCommentDepth(path) >= maxReplyDepth;
};

/**
 * Soft delete a mention record when user reads the notification
 * @param {number} commentId - The comment ID
 * @param {number} mentionedUserId - The mentioned user ID
 */
const softDeleteMention = async (commentId, mentionedUserId) => {
  try {
    await pool.query(
      `UPDATE comment_mentions 
       SET deleted_at = CURRENT_TIMESTAMP 
       WHERE comment_id = $1 AND mentioned_user_id = $2 AND deleted_at IS NULL`,
      [commentId, mentionedUserId]
    );
  } catch (err) {
    console.error('Error soft deleting mention:', err);
  }
};

/**
 * Get unread mentions for a user
 * @param {number} userId - User ID
 * @returns {Promise<Array>} - Array of unread mentions
 */
const getUnreadMentions = async (userId) => {
  try {
    const result = await pool.query(
      `SELECT cm.*, c.content, c.post_id, u.username as mentioner_username
       FROM comment_mentions cm
       JOIN comments c ON cm.comment_id = c.id
       JOIN users u ON cm.mentioner_user_id = u.id
       WHERE cm.mentioned_user_id = $1 
         AND cm.is_read = false 
         AND cm.deleted_at IS NULL
       ORDER BY cm.created_at DESC`,
      [userId]
    );
    return result.rows;
  } catch (err) {
    console.error('Error getting unread mentions:', err);
    return [];
  }
};

module.exports = {
  extractMentions,
  validateMentions,
  processMentions,
  createCommentMentions,
  notifyMentionedUsers,
  getCommentDepth,
  isMentionsOnlyDepth,
  softDeleteMention,
  getUnreadMentions
};
