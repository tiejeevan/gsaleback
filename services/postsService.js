// services/postsService.js
const pool = require('../db');
const AWS = require('aws-sdk');
const sharp = require('sharp');

// Cloudflare R2 client
const s3 = new AWS.S3({
  endpoint: new AWS.Endpoint(process.env.R2_ENDPOINT),
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  signatureVersion: 'v4',
  region: 'auto',
});

// Helper function to upload a buffer to R2
const uploadToR2 = async (buffer, key, contentType) => {
  const params = {
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: "public-read",
  };
  await s3.upload(params).promise();
};

class PostsService {
  // Create a new post
  // Create a new post
  async createPost({
    userId, content, imageUrl, videoUrl, linkPreview, sharedProductId,
    title, postType, visibility, tags, mentions, location, metadata, scheduledAt, commentsEnabled
  }) {
    const result = await pool.query(
      `INSERT INTO posts (
        user_id, content, image_url, video_url, link_preview, shared_product_id,
        title, post_type, visibility, tags, mentions, location, metadata, scheduled_at, comments_enabled
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        userId,
        content || null,
        imageUrl || null,
        videoUrl || null,
        linkPreview ? JSON.stringify(linkPreview) : null,
        sharedProductId || null,
        title || null,
        postType || 'basic',
        visibility || 'public',
        JSON.stringify(tags || []),
        JSON.stringify(mentions || []),
        location || null,
        JSON.stringify(metadata || {}),
        scheduledAt || null,
        commentsEnabled !== undefined ? commentsEnabled : true
      ]
    );

    return result.rows[0];
  }

  // Upload files to R2 and create attachments with Sharp compression
  async uploadAttachments(postId, files) {
    if (!files || files.length === 0) return [];

    const attachmentPromises = files.map(async (file) => {
      const baseKey = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
      let finalKey = baseKey;
      let contentType = file.mimetype;

      // Process images with Sharp for compression
      if (file.mimetype.startsWith('image/')) {
        try {
          // Compress and convert to WebP
          const compressedBuffer = await sharp(file.buffer)
            .resize(1200, 1200, { 
              fit: 'inside', 
              withoutEnlargement: true 
            })
            .webp({ quality: 85 })
            .toBuffer();
          
          finalKey = baseKey.replace(/\.[^/.]+$/, '') + '.webp';
          contentType = 'image/webp';
          
          await uploadToR2(compressedBuffer, finalKey, contentType);
          
          // Also generate thumbnail for faster loading
          const thumbBuffer = await sharp(file.buffer)
            .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
          const thumbKey = baseKey.replace(/\.[^/.]+$/, '') + '-thumb.webp';
          await uploadToR2(thumbBuffer, thumbKey, 'image/webp');
          
          console.log(`✅ Image compressed and uploaded: ${finalKey}`);
        } catch (err) {
          console.error('❌ Sharp processing failed, uploading original:', err.message);
          // Fallback: upload original file
          await uploadToR2(file.buffer, baseKey, file.mimetype);
          finalKey = baseKey;
        }
      } else {
        // Non-image files: upload as-is
        await uploadToR2(file.buffer, baseKey, file.mimetype);
      }

      // Store just the key (not full URL) - frontend will build the URL
      const result = await pool.query(
        `INSERT INTO attachments (post_id, file_name, file_url)
         VALUES ($1, $2, $3)
         RETURNING id, file_name, file_url, uploaded_at`,
        [postId, file.originalname, finalKey]
      );

      return result.rows[0];
    });

    return Promise.all(attachmentPromises);
  }

  // Get all posts with full details
  async getAllPosts(currentUserId, limit = 20, offset = 0) {
    const postsResult = await pool.query(
      `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_image,
              prod.id as product_id, prod.name as product_title, prod.price as product_price,
              prod.images as product_images, prod.stock_quantity as product_stock,
              prod.slug as product_slug
       FROM posts p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN products prod ON p.shared_product_id = prod.id AND prod.deleted_at IS NULL
       WHERE u.is_deleted = false 
       AND (p.is_archived = false OR p.is_archived IS NULL)
       AND (
         p.visibility = 'public' 
         OR p.user_id = $3
         OR (p.visibility = 'follows' AND EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $3 AND f.following_id = p.user_id))
       )
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset, currentUserId]
    );

    const posts = postsResult.rows.map(p => ({ ...p, user_id: Number(p.user_id) }));

    // Get total count for pagination with same filters (important for correct pagination)
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE u.is_deleted = false
       AND (p.is_archived = false OR p.is_archived IS NULL)
       AND (
         p.visibility = 'public' 
         OR p.user_id = $1
         OR (p.visibility = 'follows' AND EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = p.user_id))
       )`,
      [currentUserId]
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
      `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_image,
              prod.id as product_id, prod.name as product_title, prod.price as product_price,
              prod.images as product_images, prod.stock_quantity as product_stock,
              prod.slug as product_slug
       FROM posts p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN products prod ON p.shared_product_id = prod.id AND prod.deleted_at IS NULL
       WHERE p.user_id = $1 AND u.is_deleted = false
       AND (p.is_archived = false OR p.is_archived IS NULL)
       ORDER BY p.created_at DESC`,
      [userId]
    );

    const posts = postsResult.rows.map(p => ({ ...p, user_id: Number(p.user_id) }));
    return this.enrichPostsWithDetails(posts, currentUserId);
  }

  // Get single post by ID
  async getPostById(postId, currentUserId) {
    const postResult = await pool.query(
      `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_image,
              prod.id as product_id, prod.name as product_title, prod.price as product_price,
              prod.images as product_images, prod.stock_quantity as product_stock,
              prod.slug as product_slug
       FROM posts p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN products prod ON p.shared_product_id = prod.id AND prod.deleted_at IS NULL
       WHERE p.id = $1 AND u.is_deleted = false
       AND (p.is_archived = false OR p.is_archived IS NULL)`,
      [postId]
    );

    if (postResult.rows.length === 0) return null;

    const posts = await this.enrichPostsWithDetails([postResult.rows[0]], currentUserId);

    // Increment view count (update views_count to match the actual column name)
    await pool.query(
      `UPDATE posts SET views_count = views_count + 1 WHERE id = $1`,
      [postId]
    );

    return posts[0];
  }

  // Enrich posts with likes, and comments
  async enrichPostsWithDetails(posts, currentUserId) {
    if (posts.length === 0) return [];

    const postIds = posts.map(p => p.id);

    // Fetch attachments for all posts
    const attachmentsMap = new Map();
    try {
      const attachmentsResult = await pool.query(
        `SELECT id, post_id, file_name, file_url, uploaded_at
         FROM attachments
         WHERE post_id = ANY($1::int[])
         ORDER BY uploaded_at ASC`,
        [postIds]
      );
      
      attachmentsResult.rows.forEach(att => {
        if (!attachmentsMap.has(att.post_id)) {
          attachmentsMap.set(att.post_id, []);
        }
        attachmentsMap.get(att.post_id).push(att);
      });
    } catch (err) {
      console.error('Error fetching attachments:', err.message);
    }

    // Fetch likes
    const likesResult = await pool.query(
      `SELECT l.id AS like_id, l.user_id, l.target_id as post_id
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
      `SELECT item_id as post_id
       FROM bookmarks
       WHERE user_id = $1 AND item_type = 'post' AND item_id::int = ANY($2::int[])`,
      [currentUserId, postIds]
    );

    const userBookmarkedSet = new Set();
    bookmarksResult.rows.forEach(bookmark => {
      userBookmarkedSet.add(parseInt(bookmark.post_id));
    });

    // Fetch comments
    const commentsResult = await pool.query(
      `SELECT c.*, 
              u.username, u.first_name, u.last_name, u.profile_image,
              c.created_at AT TIME ZONE 'UTC' AS created_at,
              c.updated_at AT TIME ZONE 'UTC' AS updated_at
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.post_id = ANY($1::int[]) AND u.is_deleted = false
       ORDER BY c.created_at DESC`,
      [postIds]
    );

    const comments = commentsResult.rows.map(c => ({
      ...c,
      user_id: Number(c.user_id),
      post_id: Number(c.post_id),
      parent_comment_id: c.reply_to ? Number(c.reply_to) : null,
      created_at: new Date(c.created_at).toISOString(),
      updated_at: new Date(c.updated_at).toISOString(),
      children: []
    }));

    // No comment likes table, set defaults
    comments.forEach(c => {
      c.like_count = 0;
      c.liked_by_user = false;
    });

    // Build comment trees
    const commentsByPost = new Map();
    posts.forEach(post => {
      const postComments = comments.filter(c => c.post_id === post.id);
      commentsByPost.set(post.id, this.buildCommentsTree(postComments));
    });

    // Assemble final posts
    return posts.map(post => {
      const enrichedPost = {
        ...post,
        attachments: attachmentsMap.get(post.id) || [],
        likes: likesMap.get(post.id) || [],
        liked_by_user: userLikedSet.has(post.id),
        bookmarked_by_user: userBookmarkedSet.has(post.id),
        like_count: post.likes_count || 0,
        comments: commentsByPost.get(post.id) || []
      };

      // Add shared product data if exists
      if (post.product_id) {
        enrichedPost.shared_product = {
          id: post.product_id,
          title: post.product_title,
          name: post.product_title,
          price: post.product_price,
          images: post.product_images,
          stock_quantity: post.product_stock,
          slug: post.product_slug,
          in_stock: post.product_stock > 0,
          url: `/market/product/${post.product_id}`
        };
      }

      // Clean up product fields from main post object
      delete enrichedPost.product_id;
      delete enrichedPost.product_title;
      delete enrichedPost.product_price;
      delete enrichedPost.product_images;
      delete enrichedPost.product_stock;
      delete enrichedPost.product_slug;

      return enrichedPost;
    });
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

  // Soft delete post (using is_archived since is_deleted doesn't exist)
  async deletePost(postId, userId) {
    const result = await pool.query(
      `UPDATE posts SET is_archived = true 
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
       WHERE p.user_id = $1 AND p.is_pinned = TRUE AND u.is_deleted = FALSE
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