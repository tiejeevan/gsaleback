const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');
const compression = require('compression');

const uploadRoute = require("./routes/upload");
const commentsRoute = require("./routes/comments");

dotenv.config();
const app = express();

// Trust proxy - important for getting real IP addresses behind reverse proxies (Render, Heroku, etc.)
app.set('trust proxy', true);

// Middleware
app.use(compression()); // Enable gzip compression for all responses
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
app.use('/api/bookmarks', require('./routes/bookmarks'));
app.use('/api/news', require('./routes/news'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/database', require('./routes/database'));
app.use('/api/user-monitoring', require('./routes/userMonitoring'));
app.use('/api/test', require('./routes/test'));
app.use('/api/products', require('./routes/products'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/addresses', require('./routes/addresses'));
app.use('/api/system-settings', require('./routes/systemSettings'));
app.use('/api/search', require('./routes/search'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/reviews', require('./routes/reviews'));

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
    // Reduced logging - only log chat joins, not post joins
    if (room.startsWith('chat_') || room.startsWith('user_')) {
      console.log(`Socket ${socket.id} joined room: ${room}`);
    }
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

// Bot keep-alive functionality
const BOT_URL = process.env.BOT_URL; // e.g., https://gsalebot.onrender.com
const BOT_PING_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function pingBot() {
  if (!BOT_URL) {
    return; // Skip if BOT_URL not configured
  }

  try {
    const response = await fetch(`${BOT_URL}/health`);
    const data = await response.json();
    console.log(`✅ Bot pinged successfully - Status: ${data.status}, Healthy: ${data.healthy}`);
  } catch (error) {
    console.log(`⚠️  Bot ping failed: ${error.message}`);
  }
}

// Start bot ping interval if BOT_URL is configured
if (BOT_URL) {
  console.log(`🤖 Bot keep-alive enabled - Pinging ${BOT_URL} every 5 minutes`);
  setInterval(pingBot, BOT_PING_INTERVAL);
  // Ping immediately on startup
  setTimeout(pingBot, 10000); // Wait 10 seconds after startup
}

// Start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all network interfaces
server.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Network: http://192.168.1.107:${PORT}`); // Your local IP
});
