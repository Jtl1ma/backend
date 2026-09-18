import { Router, Request, Response } from 'express';
import { processIncomingMessage, sendInteractiveMessage, sendMessage } from '../services/whatsappService';
import { createTicket } from '../services/ticketService';
import { notifyHumanAttendant } from '../services/attendantService';
import { isWeekend } from '../utils/dateUtils';
import axios from 'axios';
import config from '../config';
const router = Router();


// Webhook para verificação (Meta requer verificação)
router.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsApp.verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook para receber mensagens
router.post('/', async (req: Request, res: Response) => {
  // Responde rápido à Meta; processa em seguida
  res.sendStatus(200);

  try {
    const body = req.body;
    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      console.warn('[webhook] payload sem messages:', JSON.stringify(body)?.slice(0, 300));
      return;
    }

    const contacts = body.entry[0].changes[0].value.contacts;

    for (const message of messages) {
      try {
        if (message.type === 'text') {
          const waId = message.from;
          const text = message.text?.body;
          if (!waId || !text) {
            console.warn('[webhook] mensagem texto incompleta', message?.id);
            continue;
          }
          const timestamp = message.timestamp;
          const contactName = contacts?.[0]?.profile?.name || 'Cliente';

          console.log(`[webhook] inbound de ${waId}: ${String(text).slice(0, 80)}`);
          await processIncomingMessage({
            from: waId,
            text: text,
            timestamp: timestamp,
            contactName: contactName,
            messageId: message.id || undefined,
          });
        } else if (message.type === 'interactive') {
          await handleInteractiveMessage(message);
        } else {
          console.log(`[webhook] tipo ignorado: ${message.type}`);
        }
      } catch (err) {
        console.error('[webhook] falha ao processar mensagem:', err);
      }
    }
  } catch (error) {
    console.error('Erro no webhook:', error);
  }
});

// Rota para enviar mensagem manualmente (admin)
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ error: 'Campos "to" e "message" são obrigatórios' });
    }

    await sendMessage(to, message);
    res.json({ success: true, message: 'Mensagem enviada com sucesso' });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

// Rota para enviar mensagem interativa
router.post('/send-interactive', async (req: Request, res: Response) => {
  try {
    const { to, text, buttons } = req.body;
    
    if (!to || !text || !buttons) {
      return res.status(400).json({ error: 'Campos obrigatórios: to, text, buttons' });
    }

    await sendInteractiveMessage(to, text, buttons);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao enviar mensagem interativa:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem interativa' });
  }
});

// Função auxiliar para mensagens interativas
async function handleInteractiveMessage(message: any) {
  const waId = message.from;
  const interactive = message.interactive;
  const buttonId = interactive.button_reply?.id;
  const listId = interactive.list_reply?.id;

  // Exemplo: Botão de agendamento
  if (buttonId === 'schedule_consultation') {
    const weekend = isWeekend();
    const response = weekend 
      ? 'Ótimo! Vamos agendar sua consultoria. Por favor, me envie: \n\n📅 Data desejada (DD/MM/AAAA)\n⏰ Horário preferido\n👤 Nome do consultor (opcional)\n\n🗓️ Nossos consultores estão disponíveis de segunda a sexta, das 9h às 18h.'
      : 'Perfeito! Vou te ajudar a agendar sua consultoria agora mesmo. Por favor, me informe: \n\n📅 Data desejada\n⏰ Horário preferido';
    
    await sendMessage(waId, response);
  }

  // Exemplo: Botão de ver posts do Instagram
  if (buttonId === 'view_instagram_posts') {
    const posts = await fetchInstagramPosts();
    const postMessages = posts.map((p: any) => 
      `📸 ${p.caption || 'Decoração'}\n🔗 ${p.permalink}`
    ).join('\n\n');
    
    await sendMessage(waId, `Confira nossas últimas decorações:\n\n${postMessages}`);
  }

  // Exemplo: Botão de abrir ticket
  if (buttonId === 'open_ticket') {
    await sendMessage(waId, '🆘 Entendi que você precisa de ajuda especializada. Vou abrir um ticket para atendimento humano. Em breve um consultor entrará em contato.');
    await createTicket(waId, 'Ticket aberto via botão de ajuda', 'high');
    // Notificar todos os atendentes humanos via WhatsApp
    await notifyHumanAttendant({
      target: 'all',
      message: 'Cliente solicitou falar com atendente humano',
      conversationId: waId,
      sendWhatsApp: true,
    }).catch((err) => {
      console.error('Falha ao notificar atendentes humanos:', err.message);
    });
  }
}

async function fetchInstagramPosts() {
  const url = `https://graph.facebook.com/v26.0/${config.instagram.businessId}/media`;
  const params = {
    fields: 'id,caption,media_url,permalink,media_type',
    access_token: config.instagram.accessToken,
    limit: 5,
  };

  const response = await axios.get(url, { params });
  return response.data?.data || [];
}

export { router as webhookRouter };
