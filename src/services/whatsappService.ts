import axios from "axios";
import { getDatabase } from "../database/database";
import { analyzeSentiment } from "./sentimentService";
import { notifyHumanAttendant } from "./attendantService";
import { isWeekend } from "../utils/dateUtils";
import { djDecorClient } from "../integrations/djDecorClient";
import { runSalesFunnel, wantsVisuals } from "./salesFunnelService";
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

  const sentiment = wantsVisuals(text)
    ? "neutral"
    : await analyzeSentiment(text);

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

  // Instagram em paralelo / cache — em pedido de foto busca mais páginas (legendas)
  const needsVisuals =
    wantsVisuals(text) || /\b(foto|imagem|refer[eê]ncia|tema)\b/i.test(text);
  const postsPromise = needsVisuals
    ? fetchInstagramPostsDeep(150)
    : fetchInstagramPosts();
  const sentimentPromise = Promise.resolve(sentiment);

  let posts: Awaited<ReturnType<typeof fetchInstagramPosts>> = [];
  if (needsVisuals) {
    posts = await Promise.race([
      postsPromise,
      new Promise<typeof posts>((resolve) =>
        setTimeout(() => resolve(igPostsCache?.posts || []), 12000)
      ),
    ]);
  } else {
    posts = await Promise.race([
      postsPromise,
      new Promise<typeof posts>((resolve) =>
        setTimeout(() => resolve(igPostsCache?.posts || []), 600)
      ),
    ]);
  }
  void sentimentPromise;

  let responseText: string;
  let festaId: string | null | undefined = crm?.festaId ?? null;
  let images: Array<{ url: string; caption?: string }> = [];
  let documents: Array<{
    url: string;
    filename: string;
    caption?: string;
  }> = [];
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
    images = funnel.images || [];
    documents = funnel.documents || [];
  } catch (err: any) {
    console.error("[whatsapp] funil falhou:", err?.message || err);
    const nome = message.contactName?.split(" ")[0];
    responseText = nome
      ? `Oi, ${nome}! Recebi sua mensagem 💛 Em que posso te ajudar?`
      : "Oi! Recebi sua mensagem 💛 Em que posso te ajudar?";
  }

  // Fotos primeiro (caption só na 1ª pra agilizar), texto depois
  let imagesSent = 0;
  for (let i = 0; i < images.slice(0, 3).length; i++) {
    const img = images[i]!;
    try {
      await sendImage(from, img.url, i === 0 ? img.caption : undefined);
      imagesSent++;
      await djDecorClient.syncOutbound({
        waId: from,
        texto: img.caption
          ? `[imagem] ${img.caption}`
          : "[imagem de referência]",
        conversaId: conversaId || undefined,
        autorTipo: "AI",
      });
    } catch (err: any) {
      console.error(
        "[whatsapp] falha ao enviar imagem:",
        err?.response?.data || err?.message || err
      );
    }
  }

  if (images.length && imagesSent === 0) {
    responseText =
      (message.contactName?.split(" ")[0]
        ? `${message.contactName.split(" ")[0]}, `
        : "") +
      "tentei te mandar as fotos agora mas deu uma falha técnica 💛 Me pede de novo em instantes, ou me diga o tema que eu tento outra referência.";
  }

  await sendAndMirrorToCrm({
    to: from,
    text: responseText,
    conversaId,
  });

  for (const doc of documents.slice(0, 2)) {
    try {
      await sendDocument(from, doc.url, doc.filename, doc.caption);
      await djDecorClient.syncOutbound({
        waId: from,
        texto: doc.caption
          ? `[documento] ${doc.caption}`
          : `[documento] ${doc.filename}`,
        conversaId: conversaId || undefined,
        autorTipo: "AI",
      });
    } catch (err: any) {
      console.error(
        "[whatsapp] falha ao enviar documento:",
        err?.response?.data || err?.message || err
      );
    }
  }

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
    throw new Error("WhatsApp API URL não configurada");
  }

  console.log("[DEBUG] sendMessage - to:", to, "url:", url);

  const response = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${config.whatsApp.accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data;
}

/** Envia imagem por link público (Meta baixa a URL). */
export async function sendImage(
  to: string,
  imageUrl: string,
  caption?: string
) {
  const url = config.whatsApp.url || process.env.WHATSAPP_API_URL;
  if (!url) {
    throw new Error("WhatsApp API URL não configurada");
  }

  console.log("[DEBUG] sendImage - to:", to, "image:", imageUrl.slice(0, 80));

  const response = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: {
        link: imageUrl,
        ...(caption ? { caption: caption.slice(0, 900) } : {}),
      },
    },
    {
      headers: {
        Authorization: `Bearer ${config.whatsApp.accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data;
}

/** Envia PDF/documento por link público (Meta baixa a URL). */
export async function sendDocument(
  to: string,
  documentUrl: string,
  filename: string,
  caption?: string
) {
  const url = config.whatsApp.url || process.env.WHATSAPP_API_URL;
  if (!url) {
    throw new Error("WhatsApp API URL não configurada");
  }

  console.log(
    "[DEBUG] sendDocument - to:",
    to,
    "doc:",
    documentUrl.slice(0, 80)
  );

  const response = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: {
        link: documentUrl,
        filename: filename.slice(0, 240),
        ...(caption ? { caption: caption.slice(0, 900) } : {}),
      },
    },
    {
      headers: {
        Authorization: `Bearer ${config.whatsApp.accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data;
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

let igPostsCache: {
  at: number;
  posts: IgPost[];
} | null = null;

export type IgPost = {
  id?: string;
  caption?: string;
  media_url?: string;
  permalink?: string;
  media_type?: string;
  thumbnail_url?: string;
  children?: {
    data?: Array<{
      id?: string;
      media_url?: string;
      media_type?: string;
      thumbnail_url?: string;
    }>;
  };
};

/** Extrai até N URLs de imagem de um post (carrossel = children). */
export function igPostImageUrls(post: IgPost, limit = 3): string[] {
  const urls: string[] = [];
  const push = (url?: string | null) => {
    if (!url || urls.includes(url) || urls.length >= limit) return;
    urls.push(url);
  };

  const kids = post.children?.data || [];
  if (kids.length) {
    for (const child of kids) {
      if (child.media_type && /VIDEO/i.test(child.media_type)) {
        push(child.thumbnail_url);
        continue;
      }
      push(child.media_url || child.thumbnail_url);
    }
  }

  if (!urls.length) {
    if (post.media_type && /VIDEO/i.test(post.media_type)) {
      push(post.thumbnail_url || post.media_url);
    } else {
      push(post.media_url || post.thumbnail_url);
    }
  }

  return urls.slice(0, limit);
}

/**
 * Se o post é carrossel mas veio sem children no feed, busca no Graph.
 */
export async function ensureIgPostChildren(post: IgPost): Promise<IgPost> {
  if (!post.id) return post;
  if (post.children?.data?.length) return post;
  if (post.media_type && !/CAROUSEL/i.test(post.media_type)) return post;

  const accessToken = config.instagram.accessToken;
  if (!accessToken) return post;

  try {
    const response = await axios.get(
      `https://graph.facebook.com/v26.0/${post.id}`,
      {
        params: {
          fields:
            "id,media_type,media_url,thumbnail_url,children{id,media_type,media_url,thumbnail_url}",
          access_token: accessToken,
        },
        timeout: 8000,
      }
    );
    return {
      ...post,
      media_type: response.data?.media_type || post.media_type,
      media_url: response.data?.media_url || post.media_url,
      thumbnail_url: response.data?.thumbnail_url || post.thumbnail_url,
      children: response.data?.children || post.children,
    };
  } catch (err: any) {
    console.warn(
      "[Instagram] falha ao expandir carrossel:",
      post.id,
      err?.message || err
    );
    return post;
  }
}

export async function fetchInstagramPosts(): Promise<IgPost[]> {
  return fetchInstagramPostsDeep(50);
}

/**
 * Busca mais posts (paginado) pra achar tema nas legendas.
 * Inclui children do carrossel quando a API devolver.
 */
export async function fetchInstagramPostsDeep(
  maxPosts = 120
): Promise<IgPost[]> {
  if (
    igPostsCache &&
    Date.now() - igPostsCache.at < 5 * 60 * 1000 &&
    igPostsCache.posts.length >= Math.min(maxPosts, 40)
  ) {
    return igPostsCache.posts;
  }

  const businessId = config.instagram.businessId;
  const accessToken = config.instagram.accessToken;
  if (!businessId || !accessToken) {
    console.warn("[Instagram] businessId/token ausente");
    return igPostsCache?.posts || [];
  }

  try {
    const posts: IgPost[] = [];
    let url: string | null =
      `https://graph.facebook.com/v26.0/${businessId}/media`;
    let params: Record<string, string | number> | null = {
      fields:
        "id,caption,media_url,permalink,media_type,thumbnail_url,children{id,media_type,media_url,thumbnail_url}",
      access_token: accessToken,
      limit: 50,
    };

    while (url && posts.length < maxPosts) {
      const response = await axios.get(url, {
        params: params || undefined,
        timeout: 10000,
      });
      const batch = response.data?.data || [];
      posts.push(...batch);
      const next = response.data?.paging?.next as string | undefined;
      url = next || null;
      params = null;
      if (!batch.length) break;
    }

    igPostsCache = { at: Date.now(), posts };
    console.log("[Instagram] posts carregados:", posts.length);
    return posts;
  } catch (error: any) {
    const isInvalidToken = error?.response?.data?.error?.message?.includes(
      "Invalid OAuth access token"
    );
    if (isInvalidToken) {
      console.error(
        "[Instagram] Token inválido:",
        error.response?.data?.error?.message
      );
    } else {
      console.warn("[Instagram] falha ao buscar posts:", error?.message || error);
    }
    return igPostsCache?.posts || [];
  }
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
