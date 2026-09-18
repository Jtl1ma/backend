import axios from "axios";
import { getDatabase } from "../database/database";
import { analyzeSentiment } from "./sentimentService";
import { notifyHumanAttendant } from "./attendantService";
import { isWeekend } from "../utils/dateUtils";
import { djDecorClient } from "../integrations/djDecorClient";
import { runSalesFunnel } from "./salesFunnelService";
import config from "../config";

/**
 * Detecta se a mensagem menciona um atendente específico.
 * Retorna o ID do atendente se encontrado, ou null se mencionar 'todos'/'qualquer um'.
 */
function detectAttendantMention(text: string): string | "all" | null {
  const lower = text.toLowerCase();

  const namePatterns: Record<string, string> = {
    debora: "debora",
    débora: "debora",
    lorena: "lorena",
    suellen: "suellen",
    suélem: "suellen",
    rodrigo: "rodrigo",
    vitoria: "vitoria",
    vitória: "vitoria",
  };

  if (
    /\b(todos?|qualquer|qualquer um|qualquer pessoa|qualquer.atendente)\b/i.test(
      lower
    )
  ) {
    return "all";
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

/** Evita processar o mesmo wamid duas vezes (retry Meta / corrida). */
const inboundLocks = new Set<string>();
const inboundDoneAt = new Map<string, number>();
const INBOUND_DEDUP_TTL_MS = 10 * 60 * 1000;

function claimInboundMessage(messageId?: string): boolean {
  if (!messageId) return true;
  const now = Date.now();
  for (const [id, at] of inboundDoneAt) {
    if (now - at > INBOUND_DEDUP_TTL_MS) inboundDoneAt.delete(id);
  }
  if (inboundDoneAt.has(messageId) || inboundLocks.has(messageId)) {
    return false;
  }
  inboundLocks.add(messageId);
  return true;
}

function releaseInboundMessage(messageId?: string, processed = true) {
  if (!messageId) return;
  inboundLocks.delete(messageId);
  if (processed) inboundDoneAt.set(messageId, Date.now());
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

  if (!claimInboundMessage(message.messageId)) {
    console.warn(
      `[whatsapp] ignorando wamid duplicado: ${message.messageId}`
    );
    return {
      responseText: null,
      sentiment: "neutral",
      skippedAi: true,
      duplicate: true,
    };
  }

  try {
    return await processIncomingMessageInner(message);
  } finally {
    releaseInboundMessage(message.messageId, true);
  }
}

async function processIncomingMessageInner(message: WhatsAppMessage) {
  const { from, text } = message;

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
      "[dj-decor] Mensagem NÃO espelhada no CRM. Confira DJDECOR_API_URL e DJDECOR_API_TOKEN no Render. Sem CRM, não respondo pra evitar duplicata."
    );
    return {
      responseText: null,
      sentiment: "neutral",
      skippedAi: true,
      crmFailed: true,
    };
  }

  console.log(
    `[dj-decor] sync OK conversa=${crm.conversaId} modo=${crm.modo} shouldRunAgent=${crm.shouldRunAgent} created=${crm.created}`
  );

  const conversaId = crm.conversaId;

  // Já processada (retry Meta / corrida no banco)
  if (!crm.created) {
    console.warn(
      `[whatsapp] inbound já existia (created=false) wamid=${message.messageId} — não respondo de novo`
    );
    return {
      responseText: null,
      sentiment: "neutral",
      skippedAi: true,
      duplicate: true,
    };
  }

  try {
    const db = getDatabase();
    await db.run(
      "INSERT OR REPLACE INTO contacts (wa_id, name, phone, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
      [from, message.contactName || null, from]
    );
  } catch (err) {
    console.warn("[sqlite] falha ao salvar contato (seguindo mesmo assim):", err);
  }

  if (!crm.shouldRunAgent) {
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

  let responseText: string;
  let festaId: string | null | undefined = crm?.festaId ?? null;
  try {
    const funnel = await runSalesFunnel({
      userMessage: text,
      waId: from,
      contactName: message.contactName,
      conversaId,
      cliente: crm?.cliente ?? null,
      festaId: crm?.festaId ?? null,
      vendedorId: crm?.sugerido?.vendedorId ?? null,
      posts,
    });
    responseText = funnel.responseText;
    festaId = funnel.festaId;
  } catch (err: any) {
    console.error("[whatsapp] funil falhou:", err?.message || err);
    const nome = message.contactName?.split(" ")[0];
    responseText = nome
      ? `Oi, ${nome}! Recebi sua mensagem 💛 Em que posso te ajudar?`
      : "Oi! Recebi sua mensagem 💛 Em que posso te ajudar?";
  }

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

  return { responseText, sentiment, festaId };
}

export async function sendMessage(to: string, text: string) {
  const url = config.whatsApp.url || process.env.WHATSAPP_API_URL;
  if (!url) {
    console.error(
      "[WhatsApp] config.whatsApp.url e WHATSAPP_API_URL estão indefinidos"
    );
    throw new Error("WhatsApp URL não configurada");
  }
  console.log("[DEBUG] sendMessage - to:", to, "url:", url);
  const data = {
    messaging_product: "whatsapp",
    to: to,
    type: "text",
    text: { body: text },
  };

  try {
    await axios.post(`${url}`, data, {
      headers: {
        Authorization: `Bearer ${config.whatsApp.accessToken}`,
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    const msg = error?.response?.data || error?.message || error;
    console.error(
      "[DEBUG] Erro WhatsApp API - status:",
      error?.response?.status
    );
    console.error("[DEBUG] Erro WhatsApp API - data:", JSON.stringify(msg));
    throw error;
  }
}

export async function sendInteractiveMessage(
  to: string,
  text: string,
  buttons: any[]
) {
  const url = config.whatsApp.url || process.env.WHATSAPP_API_URL;
  if (!url) throw new Error("WhatsApp URL não configurada");
  const data = {
    messaging_product: "whatsapp",
    to: to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: text },
      action: {
        buttons: buttons,
      },
    },
  };

  await axios.post(`${url}`, data, {
    headers: {
      Authorization: `Bearer ${config.whatsApp.accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

export async function fetchInstagramPosts() {
  const maxRetries = 2;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = `https://graph.facebook.com/v26.0/${config.instagram.businessId}/media`;
      const params = {
        fields: "id,caption,media_url,permalink,media_type",
        access_token: config.instagram.accessToken,
        limit: 5,
      };

      const response = await axios.get(url, { params });
      return response.data?.data || [];
    } catch (error: any) {
      const isInvalidToken = error?.response?.data?.error?.message?.includes(
        "Invalid OAuth access token"
      );
      if (isInvalidToken) {
        console.error(
          "[Instagram] Token inválido. Verifique o access token no config:",
          error.response?.data?.error?.message
        );
      } else {
        console.warn(
          `[Instagram] Tentativa ${attempt}/${maxRetries} falhou:`,
          error?.message || error
        );
      }
      if (attempt === maxRetries) {
        console.error(
          "[Instagram] Todas as tentativas falharam. Retornando lista vazia."
        );
        return [];
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return [];
}

async function createTicket(waId: string, message: string) {
  const db = getDatabase();
  await db.run(
    "INSERT INTO tickets (wa_id, subject, status) VALUES (?, ?, ?)",
    [waId, message.substring(0, 100), "open"]
  );
}

async function updateAnalytics(waId: string, _isWeekend: boolean) {
  const db = getDatabase();
  const today = new Date().toISOString().split("T")[0];

  try {
    await db.run(
      `INSERT INTO analytics (date, total_conversations)
       VALUES (?, 1)
       ON CONFLICT(date) DO UPDATE SET
       total_conversations = total_conversations + 1`,
      [today]
    );
  } catch (error) {
    console.warn(
      "[Analytics] Erro ao atualizar métricas:",
      (error as Error)?.message || error
    );
  }
}
