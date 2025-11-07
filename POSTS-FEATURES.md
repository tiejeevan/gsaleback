# Posts Table Improvements - Feature Guide

## 🎯 New Features Enabled

### 1. **Post Title** (`title`)
- Optional title field for posts
- Great for article-style posts or longer content
- Example: Blog posts, announcements, tutorials

### 2. **Post Types** (`post_type`)
- `text` - Regular text posts
- `image` - Image posts (with attachments)
- `video` - Video posts
- `poll` - Poll posts (can add poll data in metadata)
- `repost` - Shared/reposted content
- `article` - Long-form article posts

### 3. **Share/Repost** (`share_count`, `original_post_id`)
- Track how many times a post is shared
- Reference original post for reposts
- Build Twitter/X-style repost functionality

### 4. **Analytics** (`view_count`)
- Track post impressions
- Show "X people viewed this post"
- Build analytics dashboard

### 5. **Location Tagging** (`location`)
- Tag posts with locations
- "Posted from New York"
- Filter posts by location

### 6. **Hashtags** (`tags`)
- Store hashtags as JSON array: `["tech", "coding", "javascript"]`
- Search posts by hashtags
- Trending hashtags feature
- Example: `#javascript #webdev #coding`

### 7. **User Mentions** (`mentions`)
- Store mentioned user IDs: `[123, 456, 789]`
- Notify mentioned users
- "You were mentioned in a post"
- Example: `@john @jane check this out!`

### 8. **Scheduled Posts** (`scheduled_at`, `status`)
- Draft posts for later
- Schedule posts for future publishing
- Status: `draft`, `scheduled`, `published`, `archived`
- Great for content planning

### 9. **Pinned Posts** (`is_pinned`)
- Pin important posts to profile
- Show pinned posts at the top
- Like Twitter/X pinned tweets

### 10. **Featured Posts** (`is_featured`)
- Highlight special posts
- Admin can feature posts on homepage
- Promotional content

### 11. **Comment Control** (`comments_enabled`)
- Toggle comments on/off per post
- Useful for announcements
- Prevent spam on specific posts

### 12. **Flexible Metadata** (`metadata`)
- Store any additional data as JSON
- Poll options: `{"options": ["Yes", "No"], "votes": [10, 5]}`
- Link previews: `{"url": "...", "title": "...", "image": "..."}`
- Custom fields without schema changes

## 🚀 Usage Examples

### Create a Post with Title and Tags
```javascript
const result = await pool.query(
  `INSERT INTO posts (user_id, title, content, post_type, tags, visibility)
   VALUES ($1, $2, $3, $4, $5, $6)
   RETURNING *`,
  [
    userId,
    'My First Blog Post',
    'This is the content...',
    'article',
    JSON.stringify(['tech', 'coding', 'tutorial']),
    'public'
  ]
);
```

### Create a Scheduled Post
```javascript
const scheduledTime = new Date('2025-11-10 10:00:00');
await pool.query(
  `INSERT INTO posts (user_id, content, status, scheduled_at)
   VALUES ($1, $2, $3, $4)`,
  [userId, 'Happy Monday!', 'scheduled', scheduledTime]
);
```

### Create a Repost/Share
```javascript
await pool.query(
  `INSERT INTO posts (user_id, content, post_type, original_post_id)
   VALUES ($1, $2, $3, $4)`,
  [userId, 'Check this out!', 'repost', originalPostId]
);

// Increment share count on original post
await pool.query(
  `UPDATE posts SET share_count = share_count + 1 WHERE id = $1`,
  [originalPostId]
);
```

### Create a Poll Post
```javascript
const pollData = {
  question: 'What's your favorite language?',
  options: ['JavaScript', 'Python', 'Go', 'Rust'],
  votes: [0, 0, 0, 0],
  ends_at: '2025-11-14T00:00:00Z'
};

await pool.query(
  `INSERT INTO posts (user_id, content, post_type, metadata)
   VALUES ($1, $2, $3, $4)`,
  [userId, 'Quick poll!', 'poll', JSON.stringify(pollData)]
);
```

### Pin a Post to Profile
```javascript
// Unpin all other posts first
await pool.query(
  `UPDATE posts SET is_pinned = FALSE WHERE user_id = $1`,
  [userId]
);

// Pin the selected post
await pool.query(
  `UPDATE posts SET is_pinned = TRUE WHERE id = $1 AND user_id = $2`,
  [postId, userId]
);
```

### Search Posts by Hashtag
```javascript
const posts = await pool.query(
  `SELECT * FROM posts 
   WHERE tags @> $1 AND visibility = 'public'
   ORDER BY created_at DESC`,
  [JSON.stringify(['javascript'])]
);
```

### Get Posts with Mentions
```javascript
const posts = await pool.query(
  `SELECT * FROM posts 
   WHERE mentions @> $1
   ORDER BY created_at DESC`,
  [JSON.stringify([userId])]
);
```

### Increment View Count
```javascript
await pool.query(
  `UPDATE posts SET view_count = view_count + 1 WHERE id = $1`,
  [postId]
);
```

## 📊 Query Examples

### Get Trending Posts (by engagement)
```sql
SELECT *, 
  (like_count + comment_count * 2 + share_count * 3) as engagement_score
FROM posts
WHERE created_at > NOW() - INTERVAL '7 days'
  AND visibility = 'public'
ORDER BY engagement_score DESC
LIMIT 10;
```

### Get Scheduled Posts Ready to Publish
```sql
SELECT * FROM posts
WHERE status = 'scheduled'
  AND scheduled_at <= NOW()
ORDER BY scheduled_at ASC;
```

### Get User's Pinned Post
```sql
SELECT * FROM posts
WHERE user_id = $1 AND is_pinned = TRUE
LIMIT 1;
```

## 🎨 Future Features You Can Build

1. **Polls** - Use metadata to store poll options and votes
2. **Link Previews** - Store URL metadata for rich previews
3. **Post Series** - Use metadata to link related posts
4. **Content Warnings** - Add warnings in metadata
5. **Read Time** - Calculate and store estimated read time
6. **SEO** - Store meta descriptions and keywords
7. **Translations** - Store translated versions in metadata
8. **Reactions** - Beyond likes, store reaction types
9. **Bookmarks** - Track who bookmarked the post
10. **Edit History** - Store edit history in metadata

## 🔒 Backward Compatibility

All new columns have default values, so:
- ✅ Existing posts will work without changes
- ✅ Old API calls will continue to work
- ✅ You can adopt new features gradually
- ✅ No breaking changes to current functionality