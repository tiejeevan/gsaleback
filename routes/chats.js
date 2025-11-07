const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const messageController = require('../controllers/messageController');
const authenticateToken = require('../middleware/authMiddleware');

// ==================== CHAT ROUTES ====================

// Get user's chat list
router.get('/', authenticateToken, chatController.getUserChats);

// Create/get direct chat
router.post('/direct', authenticateToken, chatController.getOrCreateDirectChat);

// Create group chat
router.post('/group', authenticateToken, chatController.createGroupChat);

// Get chat details
router.get('/:chatId', authenticateToken, chatController.getChatDetails);

// Update chat (title, description, avatar)
router.patch('/:chatId', authenticateToken, chatController.updateChat);

// Leave/delete chat
router.delete('/:chatId', authenticateToken, chatController.leaveChat);

// Add participants to group chat
router.post('/:chatId/participants', authenticateToken, chatController.addParticipants);

// Remove participant from group chat
router.delete('/:chatId/participants/:participantId', authenticateToken, chatController.removeParticipant);

// Update participant role
router.patch('/:chatId/participants/:participantId', authenticateToken, chatController.updateParticipantRole);

// Update chat settings (mute, pin, hide)
router.patch('/:chatId/settings', authenticateToken, chatController.updateChatSettings);

// ==================== MESSAGE ROUTES ====================

// Get messages for a chat
router.get('/:chatId/messages', authenticateToken, messageController.getChatMessages);

// Send message
router.post('/:chatId/messages', authenticateToken, messageController.sendMessage);

// Mark messages as read
router.post('/:chatId/read', authenticateToken, messageController.markAsRead);

// Set typing indicator
router.post('/:chatId/typing', authenticateToken, messageController.setTyping);

// Get who's typing
router.get('/:chatId/typing', authenticateToken, messageController.getTypingUsers);

// ==================== MESSAGE-SPECIFIC ROUTES ====================

// Edit message
router.patch('/messages/:messageId', authenticateToken, messageController.editMessage);

// Delete message
router.delete('/messages/:messageId', authenticateToken, messageController.deleteMessage);

// Add reaction to message
router.post('/messages/:messageId/reactions', authenticateToken, messageController.addReaction);

// Remove reaction from message
router.delete('/messages/:messageId/reactions/:emoji', authenticateToken, messageController.removeReaction);

module.exports = router;
