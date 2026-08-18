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

/*
app.get('/teste', async (req, res) => {
  const userMessage = (req.query.msg as string) || "Oi Debora, gostaria de ver foto de ornamentação com vc.";
  const isWeekendFlag = isWeekend();
  const sentiment = await analyzeSentiment(userMessage);
  const posts = await fetchInstagramPosts().catch(() => []);

  const postsText = (posts || []).map((p: any, i: number) =>
    `${i + 1}. ${p.caption || 'Sem legenda'} - ${p.permalink}`
  ).join('\n');

  const systemPrompt = `
  Você é a "Debysinha", assistente virtual especializada em decoração e ornamentações de festas.
  Características:
  - Calorosa, atenciosa e profissional
  - Chama o cliente de "querido(a)" ou pelo nome quando souber
  - Demonstra entusiasmo por ornamentações de festas, especialmente infantis, 15 anos e casamentos
  - Conhece profundamente decoração infantis, 15 anos e de casamentos e tem acesso a todas postagens do Instagram da empresa (Debora Pimentel Decoradora)
  - Tem acesso ao histórico de mensagens do cliente para personalizar as respostas
  CONTEXTO DE HORÁRIO:
    ${isWeekendFlag ?
      'ATENÇÃO: É FIM DE SEMANA! Nossos atendentes humanos não estão trabalhando. Você deve ser extremamente acolhedor, resolver o máximo de dúvidas e informar que os atendentes humanos retornam na segunda-feira.' :
      'Hoje é dia útil. Você pode oferecer a opção de falar com um atendente humano.'}

    Sentimento do cliente: ${sentiment}
    ${sentiment === 'negative' ? 'O cliente está insatisfeito. Seja empático e tente resolver o problema. OFEREÇA CONTATO COM HUMANO URGENTEMENTE.' : ''}

    ÚLTIMAS POSTAGENS DO INSTAGRAM (use quando pedirem fotos/inspirações):
    ${postsText || 'Nenhuma postagem disponível no momento'}

    Regras importantes:
    - Se perguntar sobre fotos de decoração, mencione as postagens acima
    - Se pedirem fotos, ofereça os links do Instagram acima
    - Para agendamentos, pergunte a data e horário preferidos
    - Se for orçamento simples, peça nome, data e tamanho da ornamentação
    - Nunca prometa o que não pode cumprir
    - Nunca diga que não pode ajudar - sempre ofereça uma alternativa
    - Seja profissional e caloroso(a)
    - Use emojis adequados relacionados a decorações de festa (💍, 💒, 🌸, 🕯️, 🥂)
    - Respostas curtas e objetivas (máximo 3 parágrafos)
    - Se for fim de semana, informe que o time humano retorna na segunda
  `;

  //console.log('Modelos disponíveis:', freeModeles);

  for (const model of freeModeles) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.openrout.apiKey} || ${config.openai.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error(`Erro no modelo ${model}: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      console.log(`Resposta de ${model}:`, content);
      return res.json({ model, response: content });
    } catch (error: any) {
      console.warn(`Falha com ${model}, tentando próximo...`, error.message);
    }
  }

  return res.status(502).json({ error: "Nenhum modelo gratuito respondeu." });
});*/

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