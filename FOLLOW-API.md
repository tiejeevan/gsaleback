# Follow System API Documentation

## Overview
Complete follow/follower system with notifications, mutual follows, and suggestions.

## Base URL
```
/api/follows
```

## Authentication
All endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## Endpoints

### 1. Follow a User
Follow another user.

**Endpoint:** `POST /api/follows/:userId`

**Parameters:**
- `userId` (path) - ID of the user to follow

**Response:**
```json
{
  "success": true,
  "message": "Successfully followed user",
  "data": {
    "id": 1,
    "follower_id": 2,
    "following_id": 5,
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

**Errors:**
- `400` - Cannot follow yourself
- `404` - User not found or inactive
- `409` - Already following this user

---

### 2. Unfollow a User
Stop following a user.

**Endpoint:** `DELETE /api/follows/:userId`

**Parameters:**
- `userId` (path) - ID of the user to unfollow

**Response:**
```json
{
  "success": true,
  "message": "Successfully unfollowed user"
}
```

**Errors:**
- `404` - Not following this user

---

### 3. Check Follow Status
Check if you follow a specific user.

**Endpoint:** `GET /api/follows/:userId/status`

**Parameters:**
- `userId` (path) - ID of the user to check

**Response:**
```json
{
  "success": true,
  "data": {
    "is_following": true,
    "follower_id": 2,
    "following_id": 5
  }
}
```

---

### 4. Get Followers
Get list of users who follow a specific user.

**Endpoint:** `GET /api/follows/:userId/followers`

**Parameters:**
- `userId` (path) - ID of the user
- `limit` (query, optional) - Number of results (default: 50)
- `offset` (query, optional) - Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "followers": [
      {
        "follow_id": 123,
        "followed_at": "2024-01-15T10:30:00Z",
        "id": 2,
        "username": "john_doe",
        "display_name": "John Doe",
        "profile_image": "https://...",
        "bio": "Software developer",
        "is_verified": false,
        "follower_count": 150,
        "following_count": 200,
        "is_followed_by_current_user": true
      }
    ],
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

---

### 5. Get Following
Get list of users that a specific user follows.

**Endpoint:** `GET /api/follows/:userId/following`

**Parameters:**
- `userId` (path) - ID of the user
- `limit` (query, optional) - Number of results (default: 50)
- `offset` (query, optional) - Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "following": [
      {
        "follow_id": 456,
        "followed_at": "2024-01-10T08:20:00Z",
        "id": 5,
        "username": "jane_smith",
        "display_name": "Jane Smith",
        "profile_image": "https://...",
        "bio": "Designer & Artist",
        "is_verified": true,
        "follower_count": 5000,
        "following_count": 300,
        "is_followed_by_current_user": true
      }
    ],
    "total": 200,
    "limit": 50,
    "offset": 0
  }
}
```

---

### 6. Get Follow Stats
Get follower and following counts for a user.

**Endpoint:** `GET /api/follows/:userId/stats`

**Parameters:**
- `userId` (path) - ID of the user

**Response:**
```json
{
  "success": true,
  "data": {
    "follower_count": 150,
    "following_count": 200
  }
}
```

---

### 7. Get Mutual Follows
Get users who follow you and you follow back (friends).

**Endpoint:** `GET /api/follows/mutual/list`

**Parameters:**
- `limit` (query, optional) - Number of results (default: 50)
- `offset` (query, optional) - Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "mutual_follows": [
      {
        "id": 3,
        "username": "alice_wonder",
        "display_name": "Alice Wonder",
        "profile_image": "https://...",
        "bio": "Photographer",
        "is_verified": false,
        "follower_count": 800,
        "following_count": 600
      }
    ],
    "total": 45
  }
}
```

---

### 8. Get Follow Suggestions
Get suggested users to follow (popular users you don't follow yet).

**Endpoint:** `GET /api/follows/suggestions/list`

**Parameters:**
- `limit` (query, optional) - Number of results (default: 10)

**Response:**
```json
{
  "success": true,
  "data": {
    "suggestions": [
      {
        "id": 10,
        "username": "tech_guru",
        "display_name": "Tech Guru",
        "profile_image": "https://...",
        "bio": "Technology enthusiast",
        "is_verified": true,
        "follower_count": 10000,
        "following_count": 500
      }
    ],
    "total": 10
  }
}
```

---

### 9. Remove Follower
Remove a user from your followers (they can't follow you anymore).

**Endpoint:** `DELETE /api/follows/followers/:userId`

**Parameters:**
- `userId` (path) - ID of the follower to remove

**Response:**
```json
{
  "success": true,
  "message": "Successfully removed follower"
}
```

**Errors:**
- `404` - This user is not following you

---

### 10. Check Multiple Follows
Check follow status for multiple users at once (batch operation).

**Endpoint:** `POST /api/follows/check-multiple`

**Request Body:**
```json
{
  "user_ids": [1, 2, 3, 4, 5]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "1": true,
    "2": false,
    "3": true,
    "4": false,
    "5": true
  }
}
```

---

## Notifications

When a user follows another user, a notification is automatically created:

**Notification Type:** `follow`

**Payload:**
```json
{
  "message": "started following you",
  "follower_id": 2
}
```

---

## Database Schema

### user_follows Table
```sql
CREATE TABLE user_follows (
    id SERIAL PRIMARY KEY,
    follower_id INTEGER NOT NULL REFERENCES users(id),
    following_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(follower_id, following_id),
    CHECK (follower_id != following_id)
);
```

### users Table (Enhanced)
```sql
ALTER TABLE users 
ADD COLUMN follower_count INTEGER DEFAULT 0,
ADD COLUMN following_count INTEGER DEFAULT 0;
```

---

## Features

✅ Follow/Unfollow users
✅ Get followers and following lists
✅ Check follow status
✅ Automatic follower count updates (via triggers)
✅ Prevent duplicate follows
✅ Prevent self-follows
✅ Follow notifications
✅ Mutual follows (friends)
✅ Follow suggestions
✅ Remove followers
✅ Batch follow status checks
✅ Pagination support
✅ Performance optimized with indexes

---

## Example Usage

### JavaScript/Fetch
```javascript
// Follow a user
const followUser = async (userId, token) => {
  const response = await fetch(`/api/follows/${userId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};

// Get followers
const getFollowers = async (userId, token) => {
  const response = await fetch(`/api/follows/${userId}/followers?limit=20&offset=0`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return response.json();
};

// Check follow status
const checkFollowStatus = async (userId, token) => {
  const response = await fetch(`/api/follows/${userId}/status`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return response.json();
};
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created (follow)
- `400` - Bad request (invalid input)
- `401` - Unauthorized (missing/invalid token)
- `404` - Not found
- `409` - Conflict (already following)
- `500` - Server error
