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
    const db = (0, database_1.getDatabase)();
    const { from, text } = message;
    const sentiment = await (0, sentimentService_1.analyzeSentiment)(text);
    await db.run('INSERT INTO conversations (wa_id, message, sentiment, is_weekend) VALUES (?, ?, ?, ?)', [from, text, sentiment, (0, dateUtils_1.isWeekend)() ? 1 : 0]);
    const weekend = (0, dateUtils_1.isWeekend)();
    const posts = await fetchInstagramPosts();
    const responseText = await (0, aiService_1.generateAIResponse)(text, sentiment, weekend, posts);
    await sendMessage(from, responseText);
    if (!weekend && sentiment === 'negative') {
        await createTicket(from, text);
    }
    await updateAnalytics(from, weekend);
    return { responseText, sentiment };
}
async function sendMessage(to, text) {
    const data = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text }
    };
    try {
        await axios_1.default.post(`${config_1.default.whatsApp.url}`, data, {
            headers: {
                'Authorization': `Bearer ${config_1.default.whatsApp.accessToken}`,
                'Content-Type': 'application/json'
            }
        });
    }
    catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        throw error;
    }
}
async function sendInteractiveMessage(to, text, buttons) {
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
    await axios_1.default.post(`${config_1.default.whatsApp.url}`, data, {
        headers: {
            'Authorization': `Bearer ${config_1.default.whatsApp.accessToken}`,
            'Content-Type': 'application/json'
        }
    });
}
async function fetchInstagramPosts() {
    try {
        const url = `
    https://graph.facebook.com/${config_1.default.instagram.businessId}/media`;
        const params = {
            fields: 'id,caption,media_url,permalink,media_type',
            access_token: config_1.default.instagram.accessToken,
            limit: 5
        };
        const response = await axios_1.default.get(url, { params });
        return response.data?.data || [];
    }
    catch (error) {
        console.warn('Não foi possível buscar postagens do Instagram:', error);
        return [];
    }
}
async function createTicket(waId, message) {
    const db = (0, database_1.getDatabase)();
    await db.run('INSERT INTO tickets (wa_id, subject, status) VALUES (?, ?, ?)', [waId, message.substring(0, 100), 'open']);
}
async function updateAnalytics(waId, isWeekend) {
    const db = (0, database_1.getDatabase)();
    const today = new Date().toISOString().split('T')[0];
    await db.run(`INSERT INTO analytics (date, total_conversations) 
     VALUES (?, 1) 
     ON CONFLICT(date) DO UPDATE SET 
     total_conversations = total_conversations + 1`, [today]);
}
//# sourceMappingURL=whatsappService.js.map