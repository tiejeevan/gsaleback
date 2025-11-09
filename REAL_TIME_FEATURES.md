# Real-Time Features Implementation

This document outlines all real-time notification and update features in the application.

## ✅ Implemented Features

### 1. Post Likes
- **Real-time Update**: ✅ Emits `post_${postId}:like:new` event
- **Notification**: ✅ Sends notification to post owner
- **Deduplication**: ✅ Prevents duplicate notifications
- **Socket Room**: `post_${postId}` for updates, `user_${userId}` for notifications

### 2. Comment Likes
- **Real-time Update**: ✅ Emits `post_${postId}:comment:like:new` event
- **Notification**: ✅ Sends notification to comment owner
- **Deduplication**: ✅ Prevents duplicate notifications
- **Socket Room**: `post_${postId}` for updates, `user_${userId}` for notifications

### 3. Comments on Posts
- **Real-time Update**: ✅ Emits `post_${postId}:comment:new` event
- **Notification**: ✅ Sends notification to post owner
- **Socket Room**: `post_${postId}` for updates, `user_${userId}` for notifications

### 4. Mentions in Posts
- **Real-time Update**: ✅ Immediate notification delivery
- **Notification**: ✅ Sends notification to each mentioned user
- **Socket Room**: `user_${userId}` for each mentioned user

### 5. Mentions in Comments
- **Real-time Update**: ✅ Immediate notification delivery
- **Notification**: ✅ Sends notification to each mentioned user
- **Socket Room**: `user_${userId}` for each mentioned user

## Socket.IO Events

### Like Events
- `post_${postId}:like:new` - Post like/unlike updates
- `post_${postId}:comment:like:new` - Comment like/unlike updates

### Comment Events
- `post_${postId}:comment:new` - New comment on post

### Notification Events
- `notification:new` - New notification for user (likes, comments, mentions)

## Socket Rooms

### Post Rooms
- Format: `post_${postId}`
- Purpose: Real-time updates for specific posts (likes, comments)
- Join: `socket.emit('join', 'post_${postId}')`

### User Rooms
- Format: `user_${userId}`
- Purpose: Personal notifications (likes, comments, mentions)
- Join: `socket.emit('join', 'user_${userId}')`

## Notification Types

| Type | Description | Payload |
|------|-------------|---------|
| `like` | Post was liked | `{target_type, target_id, message}` |
| `comment_like` | Comment was liked | `{comment_id, post_id, text, message}` |
| `comment` | Comment on post | `{postId, commentId, text}` |
| `mention` | Mentioned in post/comment | `{postId, commentId?, text, mentionerUsername}` |

## Frontend Integration

### Connect Socket
```typescript
import { socket, joinUserRoom, joinPostRoom } from './socket';

// Connect socket
socket.connect();

// Join user room for notifications
joinUserRoom(userId);

// Join post room for real-time updates
joinPostRoom(postId);
```

### Listen for Notifications
```typescript
socket.on('notification:new', (notification) => {
  // Handle new notification
  console.log('New notification:', notification);
});
```

### Listen for Post Updates
```typescript
// Like updates
socket.on(`post_${postId}:like:new`, (data) => {
  // Update like count
});

// Comment updates
socket.on(`post_${postId}:comment:new`, (comment) => {
  // Add new comment to UI
});

// Comment like updates
socket.on(`post_${postId}:comment:like:new`, (data) => {
  // Update comment like count
});
```

## Deduplication Logic

All notification types implement deduplication to prevent spam:
- Only one notification per user per action
- Multiple likes/unlikes won't create duplicate notifications
- Notifications persist even if action is reversed (unlike)

## Performance Considerations

- Socket rooms are used to target specific users/posts
- Batch queries prevent N+1 problems
- Database indexes on notification queries
- Efficient duplicate checking before insertion
