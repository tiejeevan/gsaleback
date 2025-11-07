# Chat API Endpoints - Quick Reference

Base URL: `http://localhost:5000/api`

All endpoints require authentication token in header:
```
Authorization: Bearer <token>
```

---

## 📋 Chat Management

### Get User's Chats
```http
GET /chats
```

**Response:**
```json
{
  "success": true,
  "chats": [
    {
      "id": 1,
      "type": "direct",
      "title": null,
      "avatar_url": null,
      "last_message_at": "2024-01-01T12:00:00Z",
      "unread_count": 3,
      "pinned": false,
      "muted": false,
      "last_message_content": "Hey there!",
      "last_message_type": "text",
      "last_message_sender": "john_doe"
    }
  ]
}
```

---

### Create/Get Direct Chat
```http
POST /chats/direct
Content-Type: application/json

{
  "otherUserId": 2
}
```

**Response:**
```json
{
  "success": true,
  "chatId": 1,
  "created": false
}
```

---

### Create Group Chat
```http
POST /chats/group
Content-Type: application/json

{
  "title": "Team Chat",
  "description": "Our awesome team",
  "participantIds": [2, 3, 4]
}
```

**Response:**
```json
{
  "success": true,
  "chat": {
    "id": 5,
    "type": "group",
    "title": "Team Chat",
    "description": "Our awesome team",
    "created_by": 1,
    "created_at": "2024-01-01T12:00:00Z"
  }
}
```

---

### Get Chat Details
```http
GET /chats/:chatId
```

**Response:**
```json
{
  "success": true,
  "chat": {
    "id": 1,
    "type": "group",
    "title": "Team Chat",
    "participants": [
      {
        "id": 1,
        "username": "john_doe",
        "avatar_url": "https://...",
        "role": "owner",
        "joined_at": "2024-01-01T12:00:00Z"
      }
    ]
  }
}
```

---

### Update Chat
```http
PATCH /chats/:chatId
Content-Type: application/json

{
  "title": "New Title",
  "description": "New description",
  "avatar_url": "https://..."
}
```

---

### Leave Chat
```http
DELETE /chats/:chatId
```

---

### Add Participants (Group Only)
```http
POST /chats/:chatId/participants
Content-Type: application/json

{
  "participantIds": [5, 6]
}
```

---

### Remove Participant (Group Only)
```http
DELETE /chats/:chatId/participants/:participantId
```

---

### Update Participant Role (Owner Only)
```http
PATCH /chats/:chatId/participants/:participantId
Content-Type: application/json

{
  "role": "admin"
}
```

---

### Update Chat Settings
```http
PATCH /chats/:chatId/settings
Content-Type: application/json

{
  "muted": true,
  "pinned": false,
  "hidden": false
}
```

---

## 💬 Messages

### Get Messages
```http
GET /chats/:chatId/messages?limit=50&offset=0
```

**Response:**
```json
{
  "success": true,
  "messages": [
    {
      "id": 1,
      "chat_id": 1,
      "sender_id": 2,
      "content": "Hello!",
      "type": "text",
      "reply_to": null,
      "is_edited": false,
      "is_deleted": false,
      "created_at": "2024-01-01T12:00:00Z",
      "username": "john_doe",
      "avatar_url": "https://...",
      "attachments": [],
      "reactions": [
        {
          "emoji": "👍",
          "user_id": 1,
          "username": "jane_doe"
        }
      ]
    }
  ]
}
```

---

### Send Message
```http
POST /chats/:chatId/messages
Content-Type: application/json

{
  "content": "Hello everyone!",
  "type": "text",
  "replyTo": 5
}
```

**Response:**
```json
{
  "success": true,
  "message": {
    "id": 10,
    "chat_id": 1,
    "sender_id": 1,
    "content": "Hello everyone!",
    "type": "text",
    "reply_to": 5,
    "created_at": "2024-01-01T12:00:00Z"
  }
}
```

---

### Edit Message
```http
PATCH /chats/messages/:messageId
Content-Type: application/json

{
  "content": "Updated message"
}
```

---

### Delete Message
```http
DELETE /chats/messages/:messageId
```

---

### Mark Messages as Read
```http
POST /chats/:chatId/read
Content-Type: application/json

{
  "lastMessageId": 10
}
```

---

## 😊 Reactions

### Add Reaction
```http
POST /chats/messages/:messageId/reactions
Content-Type: application/json

{
  "emoji": "👍"
}
```

---

### Remove Reaction
```http
DELETE /chats/messages/:messageId/reactions/:emoji
```

Example: `DELETE /chats/messages/5/reactions/👍`

---

## ⌨️ Typing Indicators

### Set Typing
```http
POST /chats/:chatId/typing
```

---

### Get Who's Typing
```http
GET /chats/:chatId/typing
```

**Response:**
```json
{
  "success": true,
  "typingUsers": [
    {
      "id": 2,
      "username": "john_doe",
      "avatar_url": "https://..."
    }
  ]
}
```

---

## 🔌 WebSocket Events

### Client → Server

```javascript
// Join chat room
socket.emit('join_chat', { chatId: 1, userId: 1 });

// Leave chat room
socket.emit('leave_chat', { chatId: 1 });

// Typing indicator
socket.emit('typing', { chatId: 1, userId: 1 });
socket.emit('stop_typing', { chatId: 1, userId: 1 });
```

### Server → Client

```javascript
// New message
socket.on('message:new', (message) => {
  console.log('New message:', message);
});

// Message edited
socket.on('message:edited', (message) => {
  console.log('Message edited:', message);
});

// Message deleted
socket.on('message:deleted', ({ messageId }) => {
  console.log('Message deleted:', messageId);
});

// User typing
socket.on('user:typing', ({ userId }) => {
  console.log('User typing:', userId);
});

// User stopped typing
socket.on('user:stop_typing', ({ userId }) => {
  console.log('User stopped typing:', userId);
});

// Messages read
socket.on('messages:read', ({ userId, lastMessageId }) => {
  console.log('Messages read by:', userId);
});

// Reaction added
socket.on('reaction:added', ({ messageId, userId, emoji }) => {
  console.log('Reaction added:', emoji);
});

// Reaction removed
socket.on('reaction:removed', ({ messageId, userId, emoji }) => {
  console.log('Reaction removed:', emoji);
});
```

---

## 🧪 Testing with cURL

### Create Direct Chat
```bash
curl -X POST http://localhost:5000/api/chats/direct \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"otherUserId": 2}'
```

### Send Message
```bash
curl -X POST http://localhost:5000/api/chats/1/messages \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello!", "type": "text"}'
```

### Get Messages
```bash
curl -X GET "http://localhost:5000/api/chats/1/messages?limit=50&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📝 Notes

- All timestamps are in ISO 8601 format
- Pagination: Use `limit` and `offset` query params
- Real-time updates via Socket.IO on port 5000
- Typing indicators auto-expire after 5 seconds
- Soft deletes: Deleted messages remain in DB with `is_deleted = true`
