"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRouter = void 0;
const express_1 = require("express");
const whatsappService_1 = require("../services/whatsappService");
const ticketService_1 = require("../services/ticketService");
const dateUtils_1 = require("../utils/dateUtils");
const axios_1 = __importDefault(require("axios"));
const config_1 = __importDefault(require("../config"));
const router = (0, express_1.Router)();
exports.webhookRouter = router;
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === config_1.default.whatsApp.verifyToken) {
        res.status(200).send(challenge);
    }
    else {
        res.sendStatus(403);
    }
});
router.post('/', async (req, res) => {
    try {
        const { body } = req;
        if (body.entry && body.entry[0]?.changes[0]?.value?.messages) {
            const messages = body.entry[0].changes[0].value.messages;
            for (const message of messages) {
                if (message.type === 'text') {
                    const waId = message.from;
                    const text = message.text.body;
                    const timestamp = message.timestamp;
                    await (0, whatsappService_1.processIncomingMessage)({
                        from: waId,
                        text: text,
                        timestamp: timestamp
                    });
                }
                if (message.type === 'interactive') {
                    await handleInteractiveMessage(message);
                }
            }
        }
        res.sendStatus(200);
    }
    catch (error) {
        console.error('Erro no webhook:', error);
        res.sendStatus(500);
    }
});
router.post('/send', async (req, res) => {
    try {
        const { to, message } = req.body;
        if (!to || !message) {
            return res.status(400).json({ error: 'Campos "to" e "message" são obrigatórios' });
        }
        await (0, whatsappService_1.sendMessage)(to, message);
        res.json({ success: true, message: 'Mensagem enviada com sucesso' });
    }
    catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }
});
router.post('/send-interactive', async (req, res) => {
    try {
        const { to, text, buttons } = req.body;
        if (!to || !text || !buttons) {
            return res.status(400).json({ error: 'Campos obrigatórios: to, text, buttons' });
        }
        await (0, whatsappService_1.sendInteractiveMessage)(to, text, buttons);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Erro ao enviar mensagem interativa:', error);
        res.status(500).json({ error: 'Erro ao enviar mensagem interativa' });
    }
});
async function handleInteractiveMessage(message) {
    const waId = message.from;
    const interactive = message.interactive;
    const buttonId = interactive.button_reply?.id;
    const listId = interactive.list_reply?.id;
    if (buttonId === 'schedule_consultation') {
        const weekend = (0, dateUtils_1.isWeekend)();
        const response = weekend
            ? 'Ótimo! Vamos agendar sua consultoria. Por favor, me envie: \n\n📅 Data desejada (DD/MM/AAAA)\n⏰ Horário preferido\n👤 Nome do consultor (opcional)\n\n🗓️ Nossos consultores estão disponíveis de segunda a sexta, das 9h às 18h.'
            : 'Perfeito! Vou te ajudar a agendar sua consultoria agora mesmo. Por favor, me informe: \n\n📅 Data desejada\n⏰ Horário preferido';
        await (0, whatsappService_1.sendMessage)(waId, response);
    }
    if (buttonId === 'view_instagram_posts') {
        const posts = await fetchInstagramPosts();
        const postMessages = posts.map((p) => `📸 ${p.caption || 'Decoração'}\n🔗 ${p.permalink}`).join('\n\n');
        await (0, whatsappService_1.sendMessage)(waId, `Confira nossas últimas decorações:\n\n${postMessages}`);
    }
    if (buttonId === 'open_ticket') {
        await (0, whatsappService_1.sendMessage)(waId, '🆘 Entendi que você precisa de ajuda especializada. Vou abrir um ticket para atendimento humano. Em breve um consultor entrará em contato.');
        await (0, ticketService_1.createTicket)(waId, 'Ticket aberto via botão de ajuda', 'high');
    }
}
async function fetchInstagramPosts() {
    const url = `
    https://graph.facebook.com/${config_1.default.instagram.businessId}/media`;
    const params = {
        fields: 'id,caption,media_url,permalink,media_type',
        access_token: config_1.default.instagram.accessToken,
        limit: 5,
    };
    const response = await axios_1.default.get(url, { params });
    return response.data.data;
}
//# sourceMappingURL=webhook.js.map