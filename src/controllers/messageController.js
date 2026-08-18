const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const MessageEntity = require('../models/messageEntity');

/**
 * GET /api/messages
 * List all messages for a conversation
 */
const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.query;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    const messages = await req.app.get('db')
      .getRepository(MessageEntity)
      .find({ where: { conversationId } });

    res.json(messages);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/messages
 * Create a new message
 */
const createMessage = [
  body('content').optional().trim().isLength({ min: 1, max: 2000 }),
  body('conversationId').notEmpty().withMessage('conversationId is required'),
  body('senderType').isIn(['agent', 'client']).withMessage('Invalid senderType'),

  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { content, conversationId, senderType, fileUrl, fileName } = req.body;
      const senderId = req.user?.id || 'anonymous';

      const message = new MessageEntity();
      message.id = uuidv4();
      message.content = content || '';
      message.senderId = senderId;
      message.senderType = senderType;
      message.conversationId = conversationId;
      message.status = 'sent';
      message.type = fileUrl ? 'file' : (content ? 'text' : 'image');
      message.fileUrl = fileUrl;
      message.fileName = fileName;
      message.timestamp = new Date();

      const savedMessage = await req.app.get('db')
        .getRepository(MessageEntity)
        .save(message);

      // Emit real-time message via Socket.IO
      const io = req.app.get('io');
      io.to(conversationId).emit('message', savedMessage);

      res.status(201).json(savedMessage);
    } catch (err) {
      console.error('Error creating message:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
];

module.exports = {
  getMessages,
  createMessage,
  validateMessage: [
    body('content').optional().trim().isLength({ min: 1, max: 2000 }),
    body('conversationId').notEmpty().withMessage('conversationId is required'),
    body('senderType').isIn(['agent', 'client']),
  ]
};