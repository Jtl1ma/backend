"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processIncomingMessage = processIncomingMessage;
exports.sendMessage = sendMessage;
exports.sendInteractiveMessage = sendInteractiveMessage;
exports.fetchInstagramPosts = fetchInstagramPosts;
const axios_1 = __importDefault(require("axios"));
const database_1 = require("../database/database");
const sentimentService_1 = require("./sentimentService");
const aiService_1 = require("./aiService");
const dateUtils_1 = require("../utils/dateUtils");
const config_1 = __importDefault(require("../config"));
async function processIncomingMessage(message) {
    console.log('[DEBUG] processIncomingMessage iniciado:', message);
    const db = (0, database_1.getDatabase)();
    const { from, text } = message;
    await db.run('INSERT OR REPLACE INTO contacts (wa_id, name, phone, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', [from, message.contactName || null, from]);
    const sentiment = await (0, sentimentService_1.analyzeSentiment)(text);
    await db.run('INSERT INTO conversations (wa_id, message, sentiment, is_weekend) VALUES (?, ?, ?, ?)', [from, text, sentiment, (0, dateUtils_1.isWeekend)() ? 1 : 0]);
    const weekend = (0, dateUtils_1.isWeekend)();
    console.log('[DEBUG] Fim de semana:', weekend);
    console.log('[DEBUG] Iniciando fetchInstagramPosts...');
    const posts = await fetchInstagramPosts();
    console.log('[DEBUG] Posts recebidos:', posts?.length || 0, posts);
    console.log('[DEBUG] Iniciando generateAIResponse...');
    const responseText = await (0, aiService_1.generateAIResponse)(text, sentiment, weekend, posts, message.contactName);
    console.log('[DEBUG] Resposta IA gerada:', responseText);
    console.log('[DEBUG] Enviando mensagem para:', from, 'texto:', responseText);
    await sendMessage(from, responseText);
    if (!weekend && sentiment === 'negative') {
        await createTicket(from, text);
    }
    await updateAnalytics(from, weekend);
    return { responseText, sentiment };
}
async function sendMessage(to, text) {
    const url = config_1.default.whatsApp.url || process.env.WHATSAPP_API_URL;
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
        await axios_1.default.post(`${url}`, data, {
            headers: {
                'Authorization': `Bearer ${config_1.default.whatsApp.accessToken}`,
                'Content-Type': 'application/json'
            }
        });
    }
    catch (error) {
        const msg = error?.response?.data || error?.message || error;
        console.error('[DEBUG] Erro WhatsApp API - status:', error?.response?.status);
        console.error('[DEBUG] Erro WhatsApp API - data:', JSON.stringify(msg));
        throw error;
    }
}
async function sendInteractiveMessage(to, text, buttons) {
    const url = config_1.default.whatsApp.url || process.env.WHATSAPP_API_URL;
    if (!url)
        throw new Error('WhatsApp URL não configurada');
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
    await axios_1.default.post(`${url}`, data, {
        headers: {
            'Authorization': `Bearer ${config_1.default.whatsApp.accessToken}`,
            'Content-Type': 'application/json'
        }
    });
}
async function fetchInstagramPosts() {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const url = `https://graph.facebook.com/v26.0/${config_1.default.instagram.businessId}/media`;
            const params = {
                fields: 'id,caption,media_url,permalink,media_type',
                access_token: config_1.default.instagram.accessToken,
                limit: 5
            };
            const response = await axios_1.default.get(url, { params });
            return response.data?.data || [];
        }
        catch (error) {
            const isInvalidToken = error?.response?.data?.error?.message?.includes('Invalid OAuth access token');
            if (isInvalidToken) {
                console.error('[Instagram] Token inválido. Verifique o access token no config:', error.response?.data?.error?.message);
            }
            else {
                console.warn(`[Instagram] Tentativa ${attempt}/${maxRetries} falhou:`, error?.message || error);
            }
            if (attempt === maxRetries) {
                console.error('[Instagram] Todas as tentativas falharam. Retornando lista vazia.');
                return [];
            }
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
    return [];
}
async function createTicket(waId, message) {
    const db = (0, database_1.getDatabase)();
    await db.run('INSERT INTO tickets (wa_id, subject, status) VALUES (?, ?, ?)', [waId, message.substring(0, 100), 'open']);
}
async function updateAnalytics(waId, isWeekend) {
    const db = (0, database_1.getDatabase)();
    const today = new Date().toISOString().split('T')[0];
    try {
        await db.run(`INSERT INTO analytics (date, total_conversations)
       VALUES (?, 1)
       ON CONFLICT(date) DO UPDATE SET
       total_conversations = total_conversations + 1`, [today]);
    }
    catch (error) {
        console.warn('[Analytics] Erro ao atualizar métricas:', error?.message || error);
    }
}
//# sourceMappingURL=whatsappService.js.map