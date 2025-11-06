const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

const uploadRoute = require("./routes/upload");
const commentsRoute = require("./routes/comments");

dotenv.config();
const app = express();

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

// Wrap express app in http server
const server = http.createServer(app);

// Setup Socket.IO
const io = new Server(server, {
  cors: { origin: '*' } // change to your frontend origin
});

// Socket.IO connection handlers
io.on('connection', (socket) => {
  console.log('🔌 [Socket.IO] User connected:', socket.id);

  // Handle room joining
  socket.on('join', (room) => {
    socket.join(room);
    console.log(`👥 [Socket.IO] User ${socket.id} joined room: ${room}`);
    socket.emit('joined', room);
  });

  // Handle leaving rooms
  socket.on('leave', (room) => {
    socket.leave(room);
    console.log(`👋 [Socket.IO] User ${socket.id} left room: ${room}`);
    socket.emit('left', room);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('🔌 [Socket.IO] User disconnected:', socket.id);
  });

  // Test handler for backend connectivity
  socket.on('test', (data) => {
    console.log('🧪 [Socket.IO] Test received:', data);
    socket.emit('test-response', { message: 'Backend received test', timestamp: new Date().toISOString() });
  });
});

// Make io accessible in routes
app.set('io', io);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
