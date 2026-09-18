import axios from 'axios';
import { getDatabase } from '../database/database';
import { analyzeSentiment } from './sentimentService';
import { generateAIResponse } from './aiService';
import { notifyHumanAttendant, ATTENDANTS } from './attendantService';
import { isWeekend } from '../utils/dateUtils';
import { djDecorClient } from '../integrations/djDecorClient';
import config from '../config';
//const config = require('../config/index');

/**
 * Detecta se a mensagem menciona um atendente específico.
 * Retorna o ID do atendente se encontrado, ou null se mencionar 'todos'/'qualquer um'.
 */
function detectAttendantMention(text: string): string | 'all' | null {
  const lower = text.toLowerCase();

  // Mapeia termos que o cliente pode usar
  const namePatterns: Record<string, string> = {
    'debora': 'debora',
    'débora': 'debora',
    'lorena': 'lorena',
    'suellen': 'suellen',
    'suélem': 'suellen',
    'rodrigo': 'rodrigo',
    'vitoria': 'vitoria',
    'vitória': 'vitoria',
  };

  // Se cliente quer falar com "qualquer um" ou "qualquer pessoa"
  if (/\b(todos?|qualquer|qualquer um|qualquer pessoa|qualquer.atendente)\b/i.test(lower)) {
    return 'all';
  }

  for (const [term, id] of Object.entries(namePatterns)) {
    if (lower.includes(term)) {
      return id;
    }
  }

  return null;
}


export interface WhatsAppMessage {
  from: string;
  text: string;
  timestamp: string;
  contactName: string;
  messageId?: string;
}

/** Extrai data YYYY-MM-DD de textos tipo "20/09", "20/09/2026", "amanhã", "hoje". */
function parseAgendaDateFromText(text: string): string | null {
  const lower = text.toLowerCase();
  const tz = process.env.TIMEZONE || "America/Sao_Paulo";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });

  if (/\bhoje\b/.test(lower)) return today;
  if (/\bamanh[aã]\b/.test(lower)) {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("en-CA", { timeZone: tz });
  }

  const br = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (br) {
    const day = br[1].padStart(2, "0");
    const month = br[2].padStart(2, "0");
    let year = br[3];
    if (!year) year = today.slice(0, 4);
    else if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }
  return null;
}

async function sendAndMirrorToCrm(params: {
  to: string;
  text: string;
  conversaId?: string | null;
}) {
  await sendMessage(params.to, params.text);
  await djDecorClient.syncOutbound({
    waId: params.to,
    texto: params.text,
    conversaId: params.conversaId || undefined,
    autorTipo: "AI",
  });
}

export async function processIncomingMessage(message: WhatsAppMessage) {
  console.log("[DEBUG] processIncomingMessage iniciado:", message);
  const { from, text } = message;

  // Espelha no CRM ANTES de qualquer coisa local (SQLite/IA/Meta)
  const crm = await djDecorClient.syncInbound({
    waId: from,
    texto: text,
    contatoNome: message.contactName || null,
    providerMessageId: message.messageId || null,
    timestamp: message.timestamp
      ? new Date(Number(message.timestamp) * 1000)
      : new Date(),
  });

  if (!crm) {
    console.warn(
      "[dj-decor] Mensagem NÃO espelhada no CRM. Confira DJDECOR_API_URL e DJDECOR_API_TOKEN no Render."
    );
  } else {
    console.log(
      `[dj-decor] sync OK conversa=${crm.conversaId} modo=${crm.modo} shouldRunAgent=${crm.shouldRunAgent}`
    );
  }

  const conversaId = crm?.conversaId ?? null;

  try {
    const db = getDatabase();
    await db.run(
      "INSERT OR REPLACE INTO contacts (wa_id, name, phone, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
      [from, message.contactName || null, from]
    );
  } catch (err) {
    console.warn("[sqlite] falha ao salvar contato (seguindo mesmo assim):", err);
  }

  // Humano assumiu no CRM ou cliente recorrente → não deixa a Debysinha responder
  if (crm && !crm.shouldRunAgent) {
    if (crm.handoffRecorrente && crm.sugerido) {
      const handoffText =
        `Oi! Vi que você já fez festa com a gente 🎈 ` +
        `Vou te passar para *${crm.sugerido.vendedorNome}*, ` +
        `que já te atendeu antes.`;
      await sendAndMirrorToCrm({
        to: from,
        text: handoffText,
        conversaId,
      });
      await notifyHumanAttendant({
        target: "all",
        message: `Cliente recorrente ${message.contactName || from}: "${text}" → sugerido ${crm.sugerido.vendedorNome}`,
        conversationId: from,
        sendWhatsApp: true,
      }).catch((err) =>
        console.error("Falha notificar handoff recorrente:", err.message)
      );
      return { responseText: handoffText, sentiment: "neutral", skippedAi: true };
    }

    await notifyHumanAttendant({
      target: "all",
      message: `Nova mensagem (modo humano no CRM) de ${message.contactName || from}: "${text}"`,
      conversationId: from,
      sendWhatsApp: true,
    }).catch((err) =>
      console.error("Falha notificar modo humano:", err.message)
    );
    return { responseText: null, sentiment: "neutral", skippedAi: true };
  }

  const sentiment = await analyzeSentiment(text);

  try {
    const db = getDatabase();
    await db.run(
      "INSERT INTO conversations (wa_id, message, sentiment, is_weekend) VALUES (?, ?, ?, ?)",
      [from, text, sentiment, isWeekend() ? 1 : 0]
    );
  } catch (err) {
    console.warn("[sqlite] falha ao salvar conversa local:", err);
  }

  const weekend = isWeekend();
  const posts = await fetchInstagramPosts();
  const responseText = await generateAIResponse(
    text,
    sentiment,
    weekend,
    posts,
    message.contactName
  );

  await sendAndMirrorToCrm({
    to: from,
    text: responseText,
    conversaId,
  });

  const mentionedAttendant = detectAttendantMention(text);
  if (mentionedAttendant) {
    await createTicket(
      from,
      `Solicitou falar com atendente específico: ${mentionedAttendant}. Mensagem: ${text}`
    );
    await notifyHumanAttendant({
      target: mentionedAttendant,
      message: `Cliente solicitou falar com ${mentionedAttendant}: "${text}"`,
      conversationId: from,
      sendWhatsApp: true,
    }).catch((err) =>
      console.error("Falha notificar atendente específico:", err.message)
    );
  }

  if (!weekend && sentiment === "negative") {
    await createTicket(from, text);
    await notifyHumanAttendant({
      target: "all",
      message: `Sentimento negativo detectado: ${text}`,
      conversationId: from,
      sendWhatsApp: true,
    }).catch((err) =>
      console.error(
        "Falha notificar atendentes (sentimento negativo):",
        err.message
      )
    );
  }

  await updateAnalytics(from, weekend);

  // Agenda real no CRM quando o cliente fala de festa/data
  try {
    if (djDecorClient.isEnabled()) {
      const lowerText = text.toLowerCase();
      const hasScheduleIntent =
        /\b(quero agendar|agendar|reservar|marcar|festa|evento|anivers[aá]rio|casamento|disponibilidade|tem data)\b/i.test(
          lowerText
        );
      const dataAgenda = parseAgendaDateFromText(text);

      if (hasScheduleIntent || dataAgenda) {
        const agenda = await djDecorClient.getDisponibilidade(
          dataAgenda || undefined
        );
        const labelDia = dataAgenda
          ? dataAgenda.split("-").reverse().join("/")
          : "hoje";
        const ocupadas = agenda.detalhe
          ?.map((d) => {
            const hora = d.montagem
              ? new Date(d.montagem).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: process.env.TIMEZONE || "America/Sao_Paulo",
                })
              : "";
            return hora ? `${d.tema} (${hora})` : d.tema;
          })
          .filter(Boolean);

        const respostaAgenda = agenda.disponivel
          ? `📅 Olhei no sistema para *${labelDia}*: temos *${agenda.festasNoDia}* festa(s)${
              ocupadas?.length ? ` — ${ocupadas.join(", ")}` : ""
            }. Ainda dá para encaixar! Me diga o *horário* e o *tema* que eu te ajudo com o orçamento 😊`
          : `📅 Em *${labelDia}* o sistema já está bem cheio (*${agenda.festasNoDia}* festas). Me passa outra data que eu confiro pra você!`;

        await sendAndMirrorToCrm({
          to: from,
          text: respostaAgenda,
          conversaId,
        });
      }
    }
  } catch (e: any) {
    console.error("Falha ao consultar disponibilidade no dj-decor:", e.message);
  }

  return { responseText, sentiment };
}


export async function sendMessage(to: string, text: string) {
  const url = config.whatsApp.url || process.env.WHATSAPP_API_URL;
  if (!url) {
    console.error('[WhatsApp] config.whatsApp.url e WHATSAPP_API_URL estão indefinidos');
    throw new Error('WhatsApp URL não configurada');
  }
  console.log('[DEBUG] sendMessage - to:', to, 'url:', url);
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: text }
  };

  try {
    await axios.post(`${url}`, data, {
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
  const url = config.whatsApp.url || process.env.WHATSAPP_API_URL;
  if (!url) throw new Error('WhatsApp URL não configurada');
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

  await axios.post(`${url}`, data, {
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
      const url = `https://graph.facebook.com/v26.0/${config.instagram.businessId}/media`;
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