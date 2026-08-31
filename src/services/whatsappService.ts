import axios from 'axios';
import { getDatabase } from '../database/database';
import { analyzeSentiment } from './sentimentService';
import { generateAIResponse } from './aiService';
import { isWeekend } from '../utils/dateUtils';
//import config from '../config';
const config = require('../config/index');



export interface WhatsAppMessage {
  from: string;
  text: string;
  timestamp: string;
}

export async function processIncomingMessage(message: WhatsAppMessage) {
  console.log('[DEBUG] processIncomingMessage iniciado:', message);
  const db = getDatabase();
  const { from, text } = message;
  
  // 1. Analisar sentimento
  const sentiment = await analyzeSentiment(text);
  
  // 2. Salvar conversa
  await db.run(
    'INSERT INTO conversations (wa_id, message, sentiment, is_weekend) VALUES (?, ?, ?, ?)',
    [from, text, sentiment, isWeekend() ? 1 : 0]
  );

  // 3. Verificar se é fim de semana
  const weekend = isWeekend();
  console.log('[DEBUG] Fim de semana:', weekend);

  // 4. Buscar posts do Instagram
  console.log('[DEBUG] Iniciando fetchInstagramPosts...');
  const posts = await fetchInstagramPosts();
  console.log('[DEBUG] Posts recebidos:', posts?.length || 0, posts);
  
  // 5. Gerar resposta com IA
  console.log('[DEBUG] Iniciando generateAIResponse...');
  const responseText = await generateAIResponse(text, sentiment, weekend, posts);
  console.log('[DEBUG] Resposta IA gerada:', responseText);

  // 6. Enviar resposta
  console.log('[DEBUG] Enviando mensagem para:', from, 'texto:', responseText);
  await sendMessage(from, responseText);
  
  // 7. Se não for fim de semana e sentimento negativo, abrir ticket
  if (!weekend && sentiment === 'negative') {
    // notificar atendente humano
    await createTicket(from, text);
  }
  
  // 8. Atualizar analytics
  await updateAnalytics(from, weekend);
  
  return { responseText, sentiment };
}


export async function sendMessage(to: string, text: string) {
  console.log('[DEBUG] sendMessage - to:', to, 'url:', config.whatsApp.url);
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: text }
  };

  try {
    await axios.post(`${config.whatsApp.url}`, data, {
      headers: {
        'Authorization': `Bearer ${config.whatsApp.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (error: any) {
    const msg = error?.response?.data || error?.message || error;
    console.error('[DEBUG] Erro WhatsApp API - status:', error?.response?.status);
    console.error('[DEBUG] Erro WhatsApp API - data:', JSON.stringify(msg));
    throw error;
  }
}

export async function sendInteractiveMessage(to: string, text: string, buttons: any[]) {
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: text },
      action: {
        buttons: buttons
      }
    }
  };

  await axios.post(`${config.whatsApp.url}`, data, {
    headers: {
      'Authorization': `Bearer ${config.whatsApp.accessToken}`,
      'Content-Type': 'application/json'
    }
  });
}

export async function fetchInstagramPosts() {
  const maxRetries = 2;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = `https://graph.instagram.com/v26.0/${config.instagram.businessId}/media`;
      const params = {
        fields: 'id,caption,media_url,permalink,media_type',
        access_token: config.instagram.accessToken,
        limit: 5
      };

      const response = await axios.get(url, { params });
      return response.data?.data || [];
    } catch (error: any) {
      const isInvalidToken = error?.response?.data?.error?.message?.includes('Invalid OAuth access token');
      if (isInvalidToken) {
        console.error('[Instagram] Token inválido. Verifique o access token no config:', error.response?.data?.error?.message);
      } else {
        console.warn(`[Instagram] Tentativa ${attempt}/${maxRetries} falhou:`, error?.message || error);
      }
      if (attempt === maxRetries) {
        console.error('[Instagram] Todas as tentativas falharam. Retornando lista vazia.');
        return [];
      }
      await new Promise(r => setTimeout(r, 1000 * attempt)); // retry exponencial
    }
  }
  return [];
}

async function createTicket(waId: string, message: string) {
  const db = getDatabase();
  await db.run(
    'INSERT INTO tickets (wa_id, subject, status) VALUES (?, ?, ?)',
    [waId, message.substring(0, 100), 'open']
  );
}

async function updateAnalytics(waId: string, isWeekend: boolean) {
  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];

  try {
    await db.run(
      `INSERT INTO analytics (date, total_conversations)
       VALUES (?, 1)
       ON CONFLICT(date) DO UPDATE SET
       total_conversations = total_conversations + 1`,
      [today]
    );
  } catch (error) {
    // Fallback: ignora erro de analytics (não deve bloquear atendimento)
    console.warn('[Analytics] Erro ao atualizar métricas:', (error as Error)?.message || error);
  }
}