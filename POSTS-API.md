# Posts API Documentation

## Architecture

The posts module follows a clean 3-layer architecture:

- **Routes** (`routes/posts.js`) - HTTP endpoints and request handling
- **Controller** (`controllers/postsController.js`) - Business logic and request/response formatting
- **Service** (`services/postsService.js`) - Data access and core business operations

## API Endpoints

### Create Post
```
POST /api/posts
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Body Parameters:**
```json
{
  "content": "Post content text",
  "title": "Optional post title",
  "post_type": "text|image|video|poll|repost|article",
  "visibility": "public|private|follows",
  "tags": ["javascript", "coding"],
  "mentions": [123, 456],
  "location": "New York, NY",
  "metadata": {"key": "value"},
  "scheduled_at": "2025-11-10T10:00:00Z",
  "comments_enabled": true
}
```

**Files:** Upload up to 10 files with key `files[]`

**Response:**
```json
{
  "id": 1,
  "user_id": 123,
  "content": "Post content",
  "title": "Post title",
  "post_type": "text",
  "visibility": "public",
  "tags": ["javascript"],
  "mentions": [456],
  "location": "New York",
  "status": "published",
  "attachments": [
    {
      "file_name": "image.jpg",
      "url": "https://..."
    }
  ],
  "created_at": "2025-11-07T...",
  ...
}
```

---

### Get All Posts
```
GET /api/posts
Authorization: Bearer <token>
```

**Response:** Array of posts with full details (attachments, likes, comments)

---

### Get Single Post
```
GET /api/posts/:id
Authorization: Bearer <token>
```

**Response:** Single post with full details

---

### Get User Posts
```
GET /api/posts/user/:userId
Authorization: Bearer <token>
```

**Response:** Array of posts by specific user

---

### Get Pinned Post
```
GET /api/posts/user/:userId/pinned
Authorization: Bearer <token>
```

**Response:** User's pinned post or 404

---

### Update Post
```
PUT /api/posts/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**Body Parameters:**
```json
{
  "content": "Updated content",
  "title": "Updated title",
  "visibility": "private",
  "tags": ["updated", "tags"],
  "comments_enabled": false
}
```

**Response:** Updated post object

---

### Delete Post
```
DELETE /api/posts/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "msg": "Post deleted successfully"
}
```

---

### Pin Post
```
POST /api/posts/:id/pin
Authorization: Bearer <token>
```

**Response:**
```json
{
  "msg": "Post pinned successfully",
  "post": {...}
}
```

---

### Unpin Post
```
POST /api/posts/:id/unpin
Authorization: Bearer <token>
```

**Response:**
```json
{
  "msg": "Post unpinned successfully",
  "post": {...}
}
```

---

## Post Object Structure

```json
{
  "id": 1,
  "user_id": 123,
  "username": "john_doe",
  "first_name": "John",
  "last_name": "Doe",
  "profile_image": "https://...",
  "content": "Post content",
  "title": "Post title",
  "post_type": "text",
  "visibility": "public",
  "tags": ["tag1", "tag2"],
  "mentions": [456, 789],
  "location": "New York",
  "metadata": {},
  "status": "published",
  "scheduled_at": null,
  "is_pinned": false,
  "is_featured": false,
  "is_edited": false,
  "is_deleted": false,
  "comments_enabled": true,
  "like_count": 10,
  "comment_count": 5,
  "share_count": 2,
  "view_count": 100,
  "created_at": "2025-11-07T...",
  "updated_at": "2025-11-07T...",
  "attachments": [
    {
      "id": 1,
      "file_name": "image.jpg",
      "file_url": "https://...",
      "uploaded_at": "2025-11-07T..."
    }
  ],
  "likes": [
    {
      "like_id": 1,
      "user_id": 456,
      "reaction_type": "like"
    }
  ],
  "liked_by_user": true,
  "comments": [
    {
      "id": 1,
      "user_id": 789,
      "username": "jane_doe",
      "content": "Great post!",
      "like_count": 2,
      "liked_by_user": false,
      "children": []
    }
  ]
}
```

## New Features

### 1. Post Types
- `text` - Regular text posts
- `image` - Image posts
- `video` - Video posts
- `poll` - Poll posts (use metadata for poll data)
- `repost` - Shared posts
- `article` - Long-form articles

### 2. Hashtags & Mentions
```javascript
// Create post with tags and mentions
{
  "content": "Check out #javascript with @john",
  "tags": ["javascript"],
  "mentions": [123]  // user IDs
}
```

### 3. Scheduled Posts
```javascript
{
  "content": "Future post",
  "scheduled_at": "2025-11-10T10:00:00Z"
}
// Status will be 'scheduled' until published
```

### 4. Pinned Posts
```javascript
// Pin a post to profile
POST /api/posts/123/pin

// Get pinned post
GET /api/posts/user/123/pinned
```

### 5. Location Tagging
```javascript
{
  "content": "At the beach!",
  "location": "Miami Beach, FL"
}
```

### 6. Comment Control
```javascript
{
  "content": "Announcement",
  "comments_enabled": false  // Disable comments
}
```

### 7. Flexible Metadata
```javascript
// Poll example
{
  "post_type": "poll",
  "metadata": {
    "question": "Favorite language?",
    "options": ["JavaScript", "Python", "Go"],
    "votes": [10, 5, 3],
    "ends_at": "2025-11-14T00:00:00Z"
  }
}

// Link preview example
{
  "metadata": {
    "link_preview": {
      "url": "https://example.com",
      "title": "Article Title",
      "description": "Description",
      "image": "https://..."
    }
  }
}
```

## Analytics

Posts now track:
- **view_count** - Incremented on each view
- **like_count** - Updated via likes API
- **comment_count** - Updated via comments API
- **share_count** - For future repost feature

## Status Flow

```
draft → scheduled → published → archived/deleted
```

- `draft` - Not visible to others
- `scheduled` - Will be published at scheduled_at time
- `published` - Visible based on visibility setting
- `archived` - Hidden but not deleted
- `deleted` - Soft deleted (is_deleted = true)

## Visibility Options

- `public` - Everyone can see
- `private` - Only user can see
- `follows` - Only followers can see (requires follow system)

## Error Responses

```json
{
  "error": "Error message",
  "details": "Additional details"
}
```

**Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Server Error