// controllers/postsController.js
const postsService = require('../services/postsService');
const pool = require('../db');

class PostsController {
  // Create a new post
  async createPost(req, res) {
    const { 
      content, 
      title, 
      post_type, 
      visibility, 
      tags, 
      mentions, 
      location, 
      metadata, 
      scheduled_at,
      comments_enabled,
      shared_product_id
    } = req.body;
    
    const userId = req.user.id;

    console.log('📥 Received request body:', { content, mentions, visibility });
    console.log('📥 Mentions type:', typeof mentions);
    console.log('📥 Mentions value:', mentions);

    if (!content || content.trim() === '' && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ error: 'Post content or files cannot be empty' });
    }

    try {
      // Parse mentions if it's a string
      let mentionsArray = mentions;
      if (typeof mentions === 'string') {
        try {
          mentionsArray = JSON.parse(mentions);
          console.log('✅ Parsed mentions from string:', mentionsArray);
        } catch (e) {
          console.log('❌ Failed to parse mentions:', e.message);
          mentionsArray = [];
        }
      } else if (Array.isArray(mentions)) {
        console.log('✅ Mentions already an array:', mentionsArray);
      }

      // Create post
      const post = await postsService.createPost({
        userId,
        content,
        title,
        postType: post_type,
        visibility,
        tags,
        mentions: mentionsArray,
        location,
        metadata,
        scheduledAt: scheduled_at,
        commentsEnabled: comments_enabled,
        sharedProductId: shared_product_id
      });

      // Upload attachments if any
      if (req.files && req.files.length > 0) {
        post.attachments = await postsService.uploadAttachments(post.id, req.files);
      } else {
        post.attachments = [];
      }

      // Return post without enrichment for now
      const enrichedPost = post;

      // Send notifications to mentioned users
      console.log('📝 Mentions received:', mentionsArray);
      if (mentionsArray && mentionsArray.length > 0) {
        try {
          console.log('🔍 Looking up mentioned users:', mentionsArray);
          
          // Get user IDs for mentioned usernames
          const userResult = await pool.query(
            `SELECT id, username FROM users WHERE username = ANY($1::text[])`,
            [mentionsArray]
          );
          
          const mentionedUsers = userResult.rows;
          console.log('👥 Found mentioned users:', mentionedUsers);
          
          const mentionerResult = await pool.query(
            `SELECT username FROM users WHERE id = $1`,
            [userId]
          );
          const mentionerUsername = mentionerResult.rows[0]?.username || 'Someone';
          console.log('👤 Mentioner username:', mentionerUsername);
          
          // Create notifications for each mentioned user
          for (const mentionedUser of mentionedUsers) {
            if (mentionedUser.id !== userId) { // Don't notify yourself
              console.log(`📬 Creating notification for user ${mentionedUser.username} (ID: ${mentionedUser.id})`);
              
              const notifResult = await pool.query(
                `INSERT INTO notifications (recipient_user_id, actor_user_id, type, payload, is_read, created_at)
                 VALUES ($1, $2, 'mention', $3, false, CURRENT_TIMESTAMP)
                 RETURNING *`,
                [
                  mentionedUser.id,
                  userId,
                  JSON.stringify({
                    postId: post.id,
                    text: content?.slice(0, 100),
                    mentionerUsername
                  })
                ]
              );
              
              console.log('✅ Notification created:', notifResult.rows[0]);
              
              // Emit real-time notification if socket.io is available
              if (req.app.get('io')) {
                const io = req.app.get('io');
                const notification = notifResult.rows[0];
                console.log(`🔔 Emitting real-time notification to user_${mentionedUser.id}`);
                io.to(`user_${mentionedUser.id}`).emit('notification:new', notification);
              } else {
                console.log('⚠️ Socket.io not available');
              }
            } else {
              console.log('⏭️ Skipping self-mention');
            }
          }
        } catch (notifErr) {
          console.error('❌ Error sending mention notifications:', notifErr);
          // Don't fail the post creation if notifications fail
        }
      } else {
        console.log('ℹ️ No mentions to process');
      }

      // Log activity
      await postsService.logActivity({
        userId,
        postId: post.id,
        type: 'create',
        success: true,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(201).json(enrichedPost);
    } catch (err) {
      console.error('Error creating post:', err);
      res.status(500).json({ error: 'Failed to create post', details: err.message });
    }
  }

  // Get all posts
  async getAllPosts(req, res) {
    try {
      const currentUserId = req.user.id;
      const limit = parseInt(req.query.limit) || 20;
      const offset = parseInt(req.query.offset) || 0;
      
      // Simple query without enrichment for now
      const postsResult = await pool.query(
        `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_image
         FROM posts p
         JOIN users u ON p.user_id = u.id
         WHERE u.is_deleted = false
         ORDER BY p.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await pool.query(
        `SELECT COUNT(*) as total
         FROM posts p
         JOIN users u ON p.user_id = u.id
         WHERE u.is_deleted = false`
      );

      const posts = postsResult.rows.map(p => ({
        ...p,
        user_id: Number(p.user_id),
        attachments: [],
        likes: [],
        liked_by_user: false,
        bookmarked_by_user: false,
        like_count: 0,
        comments: []
      }));
      
      const result = {
        posts,
        total: parseInt(countResult.rows[0].total),
        hasMore: offset + limit < parseInt(countResult.rows[0].total)
      };
      
      res.json(result);
    } catch (err) {
      console.error('Error fetching posts:', err);
      res.status(500).json({ error: 'Failed to fetch posts' });
    }
  }

  // Get posts by user ID
  async getPostsByUserId(req, res) {
    try {
      const currentUserId = req.user.id;
      const targetUserId = Number(req.params.userId);
      const posts = await postsService.getPostsByUserId(targetUserId, currentUserId);
      res.json(posts);
    } catch (err) {
      console.error('Error fetching user posts:', err);
      res.status(500).json({ error: 'Failed to fetch user posts' });
    }
  }

  // Get single post by ID
  async getPostById(req, res) {
    try {
      const postId = req.params.id;
      const currentUserId = req.user.id;
      
      const post = await postsService.getPostById(postId, currentUserId);
      
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      res.json(post);
    } catch (err) {
      console.error('Error fetching post:', err);
      res.status(500).json({ error: 'Failed to fetch post' });
    }
  }

  // Update post
  async updatePost(req, res) {
    const postId = req.params.id;
    const userId = req.user.id;
    const updates = req.body;

    try {
      const post = await postsService.updatePost(postId, userId, updates);

      if (!post) {
        return res.status(403).json({ error: 'Unauthorized or post not found' });
      }

      await postsService.logActivity({
        userId,
        postId,
        type: 'edit',
        success: true,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json(post);
    } catch (err) {
      console.error('Error updating post:', err);
      res.status(500).json({ error: 'Failed to update post' });
    }
  }

  // Delete post
  async deletePost(req, res) {
    const postId = req.params.id;
    const userId = req.user.id;

    try {
      const post = await postsService.deletePost(postId, userId);

      if (!post) {
        return res.status(403).json({ error: 'Unauthorized or post not found' });
      }

      await postsService.logActivity({
        userId,
        postId,
        type: 'delete',
        success: true,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({ msg: 'Post deleted successfully' });
    } catch (err) {
      console.error('Error deleting post:', err);
      res.status(500).json({ error: 'Failed to delete post' });
    }
  }

  // Pin post
  async pinPost(req, res) {
    const postId = req.params.id;
    const userId = req.user.id;

    try {
      const post = await postsService.togglePinPost(postId, userId, true);

      if (!post) {
        return res.status(403).json({ error: 'Unauthorized or post not found' });
      }

      res.json({ msg: 'Post pinned successfully', post });
    } catch (err) {
      console.error('Error pinning post:', err);
      res.status(500).json({ error: 'Failed to pin post' });
    }
  }

  // Unpin post
  async unpinPost(req, res) {
    const postId = req.params.id;
    const userId = req.user.id;

    try {
      const post = await postsService.togglePinPost(postId, userId, false);

      if (!post) {
        return res.status(403).json({ error: 'Unauthorized or post not found' });
      }

      res.json({ msg: 'Post unpinned successfully', post });
    } catch (err) {
      console.error('Error unpinning post:', err);
      res.status(500).json({ error: 'Failed to unpin post' });
    }
  }

  // Get pinned post
  async getPinnedPost(req, res) {
    const userId = Number(req.params.userId);

    try {
      const post = await postsService.getPinnedPost(userId);
      
      if (!post) {
        return res.status(404).json({ error: 'No pinned post found' });
      }

      res.json(post);
    } catch (err) {
      console.error('Error fetching pinned post:', err);
      res.status(500).json({ error: 'Failed to fetch pinned post' });
    }
  }
}

module.exports = new PostsController();