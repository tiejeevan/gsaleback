// services/postsService.js
const pool = require('../db');
const AWS = require('aws-sdk');

// Cloudflare R2 client
const s3 = new AWS.S3({
  endpoint: new AWS.Endpoint(process.env.R2_ENDPOINT),
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  signatureVersion: 'v4',
  region: 'auto',
});

class PostsService {
  // Create a new post
  async createPost({ userId, content, title, postType, visibility, tags, mentions, location, metadata, scheduledAt, commentsEnabled }) {
    const status = scheduledAt ? 'scheduled' : 'published';
    
    const result = await pool.query(
      `INSERT INTO posts (
        user_id, content, title, post_type, visibility, tags, mentions, 
        location, metadata, scheduled_at, status, comments_enabled
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        userId,
        content || null,
        title || null,
        postType || 'text',
        visibility || 'public',
        tags ? JSON.stringify(tags) : '[]',
        mentions ? JSON.stringify(mentions) : '[]',
        location || null,
        metadata ? JSON.stringify(metadata) : '{}',
        scheduledAt || null,
        status,
        commentsEnabled !== undefined ? commentsEnabled : true
      ]
    );

    return result.rows[0];
  }

  // Upload files to R2 and create attachments
  async uploadAttachments(postId, files) {
    if (!files || files.length === 0) return [];

    const attachmentPromises = files.map(async (file) => {
      const key = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
      const params = {
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      };
      
      await s3.upload(params).promise();
      const fileUrl = `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${key}`;

      await pool.query(
        `INSERT INTO attachments (post_id, file_name, file_url)
         VALUES ($1, $2, $3)`,
        [postId, file.originalname, fileUrl]
      );

      return { file_name: file.originalname, url: fileUrl };
    });

    return Promise.all(attachmentPromises);
  }

  // Get all posts with full details
  async getAllPosts(currentUserId, limit = 20, offset = 0) {
    const postsResult = await pool.query(
      `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_image
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.is_deleted = false AND p.status = 'published' AND p.visibility = 'public'
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const posts = postsResult.rows.map(p => ({ ...p, user_id: Number(p.user_id) }));
    
    // Get total count for pagination
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM posts p
       WHERE p.is_deleted = false AND p.status = 'published' AND p.visibility = 'public'`
    );
    
    const enrichedPosts = await this.enrichPostsWithDetails(posts, currentUserId);
    
    return {
      posts: enrichedPosts,
      total: parseInt(countResult.rows[0].total),
      hasMore: offset + limit < parseInt(countResult.rows[0].total)
    };
  }

  // Get posts by user ID
  async getPostsByUserId(userId, currentUserId) {
    const postsResult = await pool.query(
      `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_image
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = $1 AND p.is_deleted = false AND p.status = 'published'
       ORDER BY p.created_at DESC`,
      [userId]
    );

    const posts = postsResult.rows.map(p => ({ ...p, user_id: Number(p.user_id) }));
    return this.enrichPostsWithDetails(posts, currentUserId);
  }

  // Get single post by ID
  async getPostById(postId, currentUserId) {
    const postResult = await pool.query(
      `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_image
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1 AND p.is_deleted = false`,
      [postId]
    );

    if (postResult.rows.length === 0) return null;

    const posts = await this.enrichPostsWithDetails([postResult.rows[0]], currentUserId);
    
    // Increment view count
    await pool.query(
      `UPDATE posts SET view_count = view_count + 1 WHERE id = $1`,
      [postId]
    );

    return posts[0];
  }

  // Enrich posts with attachments, likes, and comments
  async enrichPostsWithDetails(posts, currentUserId) {
    if (posts.length === 0) return [];

    const postIds = posts.map(p => p.id);

    // Fetch attachments
    const attachResult = await pool.query(
      `SELECT id, post_id, file_name, file_url, uploaded_at
       FROM attachments
       WHERE post_id = ANY($1::int[])`,
      [postIds]
    );

    const attachmentsMap = new Map();
    attachResult.rows.forEach(att => {
      if (!attachmentsMap.has(att.post_id)) attachmentsMap.set(att.post_id, []);
      attachmentsMap.get(att.post_id).push(att);
    });

    // Fetch likes
    const likesResult = await pool.query(
      `SELECT l.id AS like_id, l.user_id, l.reaction_type, l.target_id AS post_id
       FROM likes l
       WHERE l.target_type = 'post' AND l.target_id = ANY($1::int[])`,
      [postIds]
    );

    const likesMap = new Map();
    const userLikedSet = new Set();
    likesResult.rows.forEach(like => {
      if (!likesMap.has(like.post_id)) likesMap.set(like.post_id, []);
      likesMap.get(like.post_id).push({ ...like, user_id: Number(like.user_id) });
      if (like.user_id === currentUserId) userLikedSet.add(like.post_id);
    });

    // Fetch bookmarks
    const bookmarksResult = await pool.query(
      `SELECT post_id
       FROM bookmarks
       WHERE user_id = $1 AND post_id = ANY($2::int[])`,
      [currentUserId, postIds]
    );

    const userBookmarkedSet = new Set();
    bookmarksResult.rows.forEach(bookmark => {
      userBookmarkedSet.add(bookmark.post_id);
    });

    // Fetch comments
    const commentsResult = await pool.query(
      `SELECT c.*, 
              u.username, u.first_name, u.last_name, u.profile_image,
              c.created_at AT TIME ZONE 'UTC' AS created_at,
              c.updated_at AT TIME ZONE 'UTC' AS updated_at
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.post_id = ANY($1::int[]) AND c.is_deleted = false
       ORDER BY c.created_at DESC`,
      [postIds]
    );

    const comments = commentsResult.rows.map(c => ({
      ...c,
      user_id: Number(c.user_id),
      post_id: Number(c.post_id),
      parent_comment_id: c.parent_comment_id ? Number(c.parent_comment_id) : null,
      created_at: new Date(c.created_at).toISOString(),
      updated_at: new Date(c.updated_at).toISOString(),
      children: []
    }));

    // Fetch comment likes
    const commentIds = comments.map(c => c.id);
    let commentLikesMap = new Map();
    let commentUserLikedSet = new Set();

    if (commentIds.length > 0) {
      const commentLikesResult = await pool.query(
        `SELECT comment_id, user_id
         FROM comment_likes
         WHERE comment_id = ANY($1::int[])`,
        [commentIds]
      );

      commentLikesResult.rows.forEach(like => {
        if (!commentLikesMap.has(like.comment_id)) commentLikesMap.set(like.comment_id, 0);
        commentLikesMap.set(like.comment_id, commentLikesMap.get(like.comment_id) + 1);
        if (like.user_id === currentUserId) commentUserLikedSet.add(like.comment_id);
      });
    }

    comments.forEach(c => {
      c.like_count = commentLikesMap.get(c.id) || 0;
      c.liked_by_user = commentUserLikedSet.has(c.id);
    });

    // Build comment trees
    const commentsByPost = new Map();
    posts.forEach(post => {
      const postComments = comments.filter(c => c.post_id === post.id);
      commentsByPost.set(post.id, this.buildCommentsTree(postComments));
    });

    // Assemble final posts
    return posts.map(post => ({
      ...post,
      attachments: attachmentsMap.get(post.id) || [],
      likes: likesMap.get(post.id) || [],
      liked_by_user: userLikedSet.has(post.id),
      bookmarked_by_user: userBookmarkedSet.has(post.id),
      like_count: (likesMap.get(post.id) || []).length,
      comments: commentsByPost.get(post.id) || []
    }));
  }

  // Build nested comment tree
  buildCommentsTree(comments) {
    const map = new Map();
    const roots = [];
    
    comments.forEach(c => map.set(c.id, c));
    comments.forEach(c => {
      if (!c.parent_comment_id) {
        roots.push(c);
      } else {
        const parent = map.get(c.parent_comment_id);
        if (parent) parent.children.push(c);
        else roots.push(c);
      }
    });
    
    return roots;
  }

  // Update post
  async updatePost(postId, userId, updates) {
    const { content, title, visibility, postType, tags, mentions, location, commentsEnabled, comments_enabled, metadata } = updates;
    const commentsEnabledValue = commentsEnabled !== undefined ? commentsEnabled : comments_enabled;
    
    // Build dynamic SET clause to handle boolean values properly
    const setClauses = [];
    const values = [];
    let paramCount = 1;

    if (content !== undefined) {
      setClauses.push(`content = $${paramCount++}`);
      values.push(content);
    }
    if (title !== undefined) {
      setClauses.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (visibility !== undefined) {
      setClauses.push(`visibility = $${paramCount++}`);
      values.push(visibility);
    }
    if (postType !== undefined) {
      setClauses.push(`post_type = $${paramCount++}`);
      values.push(postType);
    }
    if (tags !== undefined) {
      setClauses.push(`tags = $${paramCount++}`);
      values.push(JSON.stringify(tags));
    }
    if (mentions !== undefined) {
      setClauses.push(`mentions = $${paramCount++}`);
      values.push(JSON.stringify(mentions));
    }
    if (location !== undefined) {
      setClauses.push(`location = $${paramCount++}`);
      values.push(location);
    }
    if (commentsEnabledValue !== undefined) {
      setClauses.push(`comments_enabled = $${paramCount++}`);
      values.push(commentsEnabledValue);
    }
    if (metadata !== undefined) {
      setClauses.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(metadata));
    }

    // Always update these
    setClauses.push('is_edited = true');
    setClauses.push('updated_at = CURRENT_TIMESTAMP');

    // Add WHERE clause parameters
    values.push(postId, userId);

    const result = await pool.query(
      `UPDATE posts
       SET ${setClauses.join(', ')}
       WHERE id = $${paramCount++} AND user_id = $${paramCount++}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  // Soft delete post
  async deletePost(postId, userId) {
    const result = await pool.query(
      `UPDATE posts SET is_deleted = true, status = 'deleted' 
       WHERE id = $1 AND user_id = $2 
       RETURNING *`,
      [postId, userId]
    );

    return result.rows[0] || null;
  }

  // Pin/unpin post
  async togglePinPost(postId, userId, isPinned) {
    if (isPinned) {
      // Unpin all other posts first
      await pool.query(
        `UPDATE posts SET is_pinned = FALSE WHERE user_id = $1`,
        [userId]
      );
    }

    const result = await pool.query(
      `UPDATE posts SET is_pinned = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [isPinned, postId, userId]
    );

    return result.rows[0] || null;
  }

  // Get pinned post
  async getPinnedPost(userId) {
    const result = await pool.query(
      `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_image
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = $1 AND p.is_pinned = TRUE AND p.is_deleted = FALSE
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) return null;
    
    const posts = await this.enrichPostsWithDetails([result.rows[0]], userId);
    return posts[0];
  }

  // Log activity
  async logActivity({ userId, postId, type, success, ipAddress, userAgent }) {
    try {
      await pool.query(
        `INSERT INTO post_logs (user_id, post_id, activity_type, ip_address, user_agent, success)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, postId, type, ipAddress, userAgent, success]
      );
    } catch (err) {
      console.error('Error logging post activity:', err.message);
    }
  }
}

module.exports = new PostsService();