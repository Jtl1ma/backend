import dotenv from 'dotenv';
import express, { Express } from 'express';
import cors from 'cors';
import { initializeDatabase } from './database/database';
import { webhookRouter } from './routes/webhook';
import { ticketRouter } from './routes/ticket';
import { schedulingRouter } from './routes/scheduling';
import { analyticsRouter } from './routes/analytics';
import { instagramRouter } from './routes/instagram';
import { adminRouter } from './routes/admin';
import { startReminderScheduler } from './services/reminderService';
import { authMiddleware } from './middleware/auth';
import config from './config';
import ngrok from '@ngrok/ngrok';
import { Server } from 'socket.io';
import http from 'http';
import atendente from './routes/atendente';
import path from 'path';
const helmet = require('helmet');
dotenv.config();

const app: Express = express();
const server = http.createServer(app);
const PORT = config.port || 3000;

/**
 * Initialize the application
 */
async function startServer() {
  try {
    // Ensure database is initialized before setting up any routes
    await initializeDatabase();
    startReminderScheduler();

    // Export io for use in other modules
    const io = new Server(server, {
      cors: {
        origin: '*',
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    app.set('io', io);
    app.use(helmet());

    // Middleware
    app.use(cors());
    app.use(express.json({ limit: '10kb' }));
    app.use(express.urlencoded({ extended: true, limit: '10kb' }));

    // Register routes
    app.use('/webhook', webhookRouter);
    app.use('/auth', adminRouter);
    app.use('/atendente', atendente);
    app.use('/api/tickets', authMiddleware, ticketRouter);
    app.use('/api/scheduling', authMiddleware, schedulingRouter);
    app.use('/api/analytics', authMiddleware, analyticsRouter);
    app.use('/api/instagram', authMiddleware, instagramRouter);
    app.use('/api/admin', authMiddleware, adminRouter);

    // Health check
    app.get('/health', (req, res) => {
      res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // Error handling
    app.use((err: Error, req: any, res: any, next: any) => {
      console.error('Unexpected error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    });

    // Server startup
    server.listen(PORT, () => {
      console.log('🚀 Servidor rodando na porta', PORT);
      console.log('📱 Webhook disponível em: /webhook');
      console.log('📊 Dashboard em: /api/analytics/dashboard');
      console.log('🔐 Login em: /auth/login');

      // Configure ngrok to expose the local server
      ngrok.forward({
        addr: PORT,
        authtoken_from_env: true,
      }).then(listener => {
        console.log(`✅ Ngrok URL: ${listener.url()}`);
      }).catch(error => {
        console.error('Failed to start ngrok:', error.message);
      });
    });
  } catch (err) {
    console.error('Error starting server:', err);
    server.close();
    process.exit(1);
  }
}

startServer().catch(console.error);

export default app;