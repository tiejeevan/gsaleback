const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

const uploadRoute = require("./routes/upload");
const commentsRoute = require("./routes/comments");

dotenv.config();
const app = express();

// Trust proxy - important for getting real IP addresses behind reverse proxies (Render, Heroku, etc.)
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/posts', require('./routes/posts'));
app.use("/api/upload", uploadRoute);
app.use('/api/likes', require('./routes/likes'));
app.use('/api/comments', commentsRoute);
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/users", require("./routes/users"));
app.use('/api/chats', require('./routes/chats'));
app.use('/api/follows', require('./routes/follows'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/database', require('./routes/database'));
app.use('/api/user-monitoring', require('./routes/userMonitoring'));
app.use('/api/test', require('./routes/test'));

// Wrap express app in http server
const server = http.createServer(app);

// Setup Socket.IO
const io = new Server(server, {
  cors: { origin: '*' } // change to your frontend origin
});

// Socket.IO connection handlers
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle room joining
  socket.on('join', (room) => {
    socket.join(room);
    console.log(`Socket ${socket.id} joined room: ${room}`);
    socket.emit('joined', room);
  });

  // Handle leaving rooms
  socket.on('leave', (room) => {
    socket.leave(room);
    socket.emit('left', room);
  });

  // Chat-specific handlers
  socket.on('join_chat', ({ chatId, userId }) => {
    socket.join(`chat_${chatId}`);
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined chat ${chatId}`);
  });

  socket.on('leave_chat', ({ chatId }) => {
    socket.leave(`chat_${chatId}`);
    console.log(`User left chat ${chatId}`);
  });

  socket.on('typing', ({ chatId, userId }) => {
    socket.to(`chat_${chatId}`).emit('user:typing', { userId });
  });

  socket.on('stop_typing', ({ chatId, userId }) => {
    socket.to(`chat_${chatId}`).emit('user:stop_typing', { userId });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  // Test handler for backend connectivity
  socket.on('test', (data) => {
    socket.emit('test-response', { message: 'Backend received test', timestamp: new Date().toISOString() });
  });
});

// Make io accessible in routes
app.set('io', io);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
