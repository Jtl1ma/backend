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
//import { analyzeSentiment } from './services/sentimentService';
//import { fetchInstagramPosts } from './services/whatsappService';
//import { isWeekend } from './utils/dateUtils';
import config, {freeModeles} from './config';
import ngrok from '@ngrok/ngrok';
//import axios from 'axios';
import { Server, Socket } from 'socket.io';
import http from 'http';
//import { NotificationService } from './services/notificationService';
//import { createConnection } from "typeorm";
const path = require('path');
const helmet = require('helmet');
dotenv.config();

const app: Express = express();
const server = http.createServer(app);
const PORT = config.port || 3000;

(async () => {
  try {
  /*   const connection = await createConnection({
      type: 'sqlite', // O TypeORM requer a notação 'sqlite' (sem dois-pontos) quando usado com sqlite3 v5.x
      database: path.join(__dirname, '../../data/data.sqlite'),
      synchronize: true,
      logging: false,
      entities: [
        require('./models/messageEntity'),
        require('./models/fileEntity')
      ]
    });*/


    /*const io = new express().use(serverStatic("public")).listen(PORT || 3333);
    const socketIo = require("socket.io")(io, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]    
    }
  });*/
  
 // Export io for use in other modules
 const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});
    //app.set('db', connection);
    app.set('io', io);

    app.use(helmet());


// Middleware
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));


// Routes
   /* const messageRoutes = require('./routes/messageRoutes');
    const fileRoutes = require('./routes/fileRoutes');
    app.use('/api/messages', messageRoutes);
    app.use('/api/files', fileRoutes);*/

    // Error handling middleware
   // const errorHandler = require('./middleware/errorHandler');
   // app.use(errorHandler);

    // Static files for uploads
    app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Rotas públicas
app.use('/webhook', webhookRouter);

// Rotas protegidas (requer autenticação)
app.use('/api/tickets', authMiddleware, ticketRouter);
app.use('/api/scheduling', authMiddleware, schedulingRouter);
app.use('/api/analytics', authMiddleware, analyticsRouter);
app.use('/api/instagram', authMiddleware, instagramRouter);
app.use('/api/admin', authMiddleware, adminRouter);

// Rota pública para admin login
app.use('/auth', adminRouter);

// Health check
app.get('/health', async(req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });

});

// Ngrok
const startNgrok = async (port: number) => {
    //const url = await ngrok.connect({
    const listener = await ngrok.forward({
        addr: port,
        authtoken_from_env: true,
        //domain: process.env.NGROK_SUBDOMAIN,
    });
    console.log(`✅ Ngrok URL: ${listener.url()}`);
    return listener.url();
};


// Inicialização
async function startServer() {
  await initializeDatabase();
  startReminderScheduler();
  
  server.listen(PORT, () => {
    console.log('🚀 Servidor rodando na porta', PORT);
    console.log('📱 Webhook disponível em: /webhook');
    console.log('📊 Dashboard em: /api/analytics/dashboard');
    console.log('🔐 Login em: /auth/login');

    // Configura o ngrok para expor o servidor local

  
  startNgrok(3333).catch((error: any) => {
    console.error('Failed to start ngrok:', error.message);
  });
  });
}

startServer().catch(console.error);
} catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
})();

export default app;