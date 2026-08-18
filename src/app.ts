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
import migrate from './database/migrate';
const path = require('path');
const helmet = require('helmet');
dotenv.config();

const app: Express = express();
const server = http.createServer(app);
const PORT = config.port || 3000;

(async () => {
  try {
   
 // Export io for use in other modules
 const io = new Server(server, {
  cors: {
    origin: "*",
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

// Rota publica para atendente login
app.use('/atendente', atendente);

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
    const listener = await ngrok.forward({
        addr: port,
        authtoken_from_env: true,
    });
    console.log(`✅ Ngrok URL: ${listener.url()}`);
    return listener.url();
};


// Inicialização
async function startServer() {
  let retry = 0;
  const maxRetries = 5;
  while (retry < maxRetries) {
    try {
  //await migrate();
  await initializeDatabase();
  startReminderScheduler();

  break; // Se a inicialização for bem-sucedida, saia do loop
    } catch (err: any) {
      console.error(`Erro ao inicializar o banco de dados (tentativa ${retry + 1}):`, err.message);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Aguarda 2 segundos antes de tentar novamente
      retry++;
    }
  }
  if (retry === maxRetries) {
    console.error('Falha ao inicializar o banco de dados após várias tentativas. Encerrando o servidor.');
    process.exit(1);
  }
  
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
} catch (err: any) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
})();

export default app;