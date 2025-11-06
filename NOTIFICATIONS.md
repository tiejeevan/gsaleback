# Push Notifications for Likes

This document explains how the like notification system works with deduplication logic.

## How It Works

### When a user likes a post:

1. **Check if it's a new like** - The system first checks if the user has already liked this post
2. **Create notification** - Only if it's a new like on a post (not an update), a notification is created
3. **Deduplication** - Before creating a notification, the system checks if a notification already exists for this user-post combination
4. **Real-time signal** - If a new notification is created, it's sent via Socket.IO to the post owner

### When a user unlikes a post:

1. **Remove like** - The like is removed from the database
2. **Clean up notification** - The corresponding notification is also removed
3. **Real-time update** - Socket event is emitted for real-time like count updates

## Key Features

### ✅ Deduplication Logic
- Only one notification per user per post
- Multiple likes/unlikes by the same user won't create duplicate notifications
- Notifications are cleaned up when likes are removed

### ✅ Real-time Updates
- Socket.IO events for immediate notification delivery
- Separate events for like counts and notifications
- Users join rooms like `user_${userId}` to receive their notifications

### ✅ Performance Optimized
- Database indexes on notification queries
- Efficient duplicate checking
- Minimal database queries

## Database Schema

### Notifications Table
```sql
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    recipient_user_id INTEGER NOT NULL,
    actor_user_id INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    payload JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Notification Payload for Likes
```json
{
  "target_type": "post",
  "target_id": 123,
  "message": "liked your post"
}
```

## Setup Instructions

1. **Initialize Database**
   ```bash
   node init-db.js
   ```

2. **Test the System**
   ```bash
   node test-notifications.js
   ```

3. **API Endpoints**
   - `POST /api/likes` - Add a like (creates notification)
   - `DELETE /api/likes` - Remove a like (removes notification)
   - `GET /api/notifications` - Get user notifications

## Socket.IO Events

### For Notifications
- `notification:new` - Sent to `user_${recipientId}` room when new notification is created

### For Like Updates
- `post_${postId}:like:new` - Sent globally for real-time like count updates

## Frontend Integration

### Join User Room
```javascript
socket.emit('join', `user_${userId}`);
```

### Listen for Notifications
```javascript
socket.on('notification:new', (notification) => {
  // Handle new notification
  console.log('New notification:', notification);
});
```

### Listen for Like Updates
```javascript
socket.on(`post_${postId}:like:new`, (likeData) => {
  // Update like count in UI
  console.log('Like update:', likeData);
});
```

## Error Handling

- Graceful handling of missing post owners
- Prevention of self-notifications (users can't get notifications for liking their own posts)
- Database transaction safety
- Socket.IO connection checks before emitting events