# Real-Time Features Testing Guide

## Prerequisites
1. Backend server running on port 5000 (or your configured port)
2. Frontend running on port 5173 (or your configured port)
3. Two browser windows/tabs logged in as different users

## Test Scenarios

### ✅ 1. Post Likes - Real-Time Updates & Notifications

**Setup:**
- User A: Viewing dashboard or post detail
- User B: Viewing the same post

**Test Steps:**
1. User B clicks the like button on User A's post
2. **Expected Results:**
   - ✅ User A receives a notification toast: "User B liked your post"
   - ✅ User A's like count updates in real-time (without refresh)
   - ✅ User B's like count updates immediately
   - ✅ Like button turns red for User B

**Backend Logs to Check:**
```
📡 Emitting post_123:like:new to room post_123
🔔 Sent notification to user_456
```

**Frontend Console Logs:**
```
🔌 PostCard joined room: post_123
📡 Received like event for post 123
```

---

### ✅ 2. Comment Likes - Real-Time Updates & Notifications

**Setup:**
- User A: Has commented on a post
- User B: Viewing the same post with comments visible

**Test Steps:**
1. User B clicks the like button on User A's comment
2. **Expected Results:**
   - ✅ User A receives a notification toast: "User B liked your comment: [comment text]"
   - ✅ User A's comment like count updates in real-time
   - ✅ User B's comment like count updates immediately
   - ✅ Like button changes for User B

**Backend Logs to Check:**
```
📡 Emitting post_123:comment:like:new to room post_123
🔔 Sent comment like notification to user_456
```

**Frontend Console Logs:**
```
🔌 Socket joined room: post_123
📡 Received comment like event
```

---

### ✅ 3. Comments on Posts - Real-Time Updates & Notifications

**Setup:**
- User A: Viewing their own post
- User B: Viewing the same post

**Test Steps:**
1. User B adds a comment on User A's post
2. **Expected Results:**
   - ✅ User A receives a notification toast: "User B commented on your post: [comment text]"
   - ✅ User A sees the new comment appear in real-time
   - ✅ User B sees their comment appear immediately
   - ✅ Comment count updates for both users

**Backend Logs to Check:**
```
📡 Emitting post_123:comment:new to room post_123
🔔 Sent notification to user_456
```

**Frontend Console Logs:**
```
🔌 Socket joined room: post_123
📡 Received new comment
```

---

### ✅ 4. Mentions in Posts - Real-Time Notifications

**Setup:**
- User A: Creating a new post
- User B: Logged in (can be anywhere in the app)

**Test Steps:**
1. User A creates a post with "@UserB" in the content
2. **Expected Results:**
   - ✅ User B receives a notification toast: "User A mentioned you in a comment: [text]"
   - ✅ Clicking the notification navigates to the post
   - ✅ Comments section opens automatically

**Backend Logs to Check:**
```
📝 Mentions received: ['UserB']
👥 Found mentioned users: [{ id: 789, username: 'UserB' }]
📬 Creating notification for user UserB (ID: 789)
🔔 Emitting real-time notification to user_789
```

**Frontend Console Logs:**
```
Received notification:new event
```

---

### ✅ 5. Mentions in Comments - Real-Time Notifications

**Setup:**
- User A: Commenting on a post
- User B: Logged in (can be anywhere in the app)

**Test Steps:**
1. User A adds a comment with "@UserB" in the content
2. **Expected Results:**
   - ✅ User B receives a notification toast: "User A mentioned you in a comment: [text]"
   - ✅ Clicking the notification navigates to the post
   - ✅ Comments section opens automatically
   - ✅ The specific comment is highlighted

**Backend Logs to Check:**
```
📡 Emitting post_123:comment:new to room post_123
🔔 Sent mention notification to user_789
```

**Frontend Console Logs:**
```
Received notification:new event
```

---

## Troubleshooting

### Issue: No real-time updates

**Check:**
1. **Backend Socket.IO is running:**
   ```bash
   # Should see in backend logs:
   Server running on port 5000
   ```

2. **Frontend socket is connected:**
   ```javascript
   // In browser console:
   socket.connected // should be true
   ```

3. **User joined the correct room:**
   ```bash
   # Backend logs should show:
   Socket abc123 joined room: post_456
   Socket abc123 joined room: user_789
   ```

### Issue: Notifications not appearing

**Check:**
1. **NotificationsContext is mounted:**
   - Ensure `NotificationsProvider` wraps your app in `App.tsx`

2. **User room is joined:**
   ```javascript
   // Frontend should call:
   joinUserRoom(userId)
   ```

3. **Backend is emitting to correct room:**
   ```bash
   # Backend logs should show:
   🔔 Sent notification to user_789
   ```

### Issue: Like counts not updating

**Check:**
1. **Post room is joined:**
   ```bash
   # Backend logs:
   Socket abc123 joined room: post_456
   ```

2. **Socket event is being emitted:**
   ```bash
   # Backend logs:
   📡 Emitting post_456:like:new to room post_456
   ```

3. **Frontend is listening:**
   ```javascript
   // Check browser console for:
   🔌 PostCard joined room: post_456
   📡 Received like event for post 456
   ```

---

## Quick Test Commands

### Test Socket Connection (Browser Console)
```javascript
// Check if socket is connected
socket.connected

// Manually join a room
socket.emit('join', 'post_123')

// Listen for test event
socket.on('test-response', (data) => console.log('Test response:', data))
socket.emit('test', { message: 'hello' })
```

### Test Backend Socket (Backend Console)
```javascript
// In server.js, add temporary test endpoint:
app.get('/test-socket/:userId', (req, res) => {
  const io = req.app.get('io');
  io.to(`user_${req.params.userId}`).emit('notification:new', {
    id: 999,
    type: 'test',
    actor_user_id: 1,
    payload: { message: 'Test notification' },
    created_at: new Date().toISOString()
  });
  res.json({ sent: true });
});
```

---

## Summary Checklist

Before testing, ensure:
- [ ] Backend server is running
- [ ] Frontend is running
- [ ] Socket.IO is initialized in backend (`server.js`)
- [ ] `io` is set on express app: `app.set('io', io)`
- [ ] Frontend socket is imported and used
- [ ] NotificationsProvider wraps the app
- [ ] Two different users are logged in
- [ ] Browser console is open to see logs

## Expected Behavior Summary

| Action | Real-Time Update | Notification | Recipient |
|--------|-----------------|--------------|-----------|
| Like post | ✅ Like count | ✅ Toast | Post owner |
| Like comment | ✅ Like count | ✅ Toast | Comment owner |
| Add comment | ✅ New comment | ✅ Toast | Post owner |
| Mention in post | ❌ N/A | ✅ Toast | Mentioned user |
| Mention in comment | ✅ New comment | ✅ Toast | Mentioned user |

All features are now implemented and should work in real-time!
