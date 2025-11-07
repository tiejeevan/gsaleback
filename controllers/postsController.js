// controllers/postsController.js
const postsService = require('../services/postsService');

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
      comments_enabled 
    } = req.body;
    
    const userId = req.user.id;

    if (!content || content.trim() === '' && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ error: 'Post content or files cannot be empty' });
    }

    try {
      // Create post
      const post = await postsService.createPost({
        userId,
        content,
        title,
        postType: post_type,
        visibility,
        tags,
        mentions,
        location,
        metadata,
        scheduledAt: scheduled_at,
        commentsEnabled: comments_enabled
      });

      // Upload attachments if any
      if (req.files && req.files.length > 0) {
        post.attachments = await postsService.uploadAttachments(post.id, req.files);
      } else {
        post.attachments = [];
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

      res.status(201).json(post);
    } catch (err) {
      console.error('Error creating post:', err);
      res.status(500).json({ error: 'Failed to create post', details: err.message });
    }
  }

  // Get all posts
  async getAllPosts(req, res) {
    try {
      const currentUserId = req.user.id;
      const posts = await postsService.getAllPosts(currentUserId);
      res.json(posts);
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