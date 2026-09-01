"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ticketRouter = void 0;
const express_1 = require("express");
const ticketService_1 = require("../services/ticketService");
const whatsappService_1 = require("../services/whatsappService");
const attendantService_1 = require("../services/attendantService");
const database_1 = require("../database/database");
const router = (0, express_1.Router)();
exports.ticketRouter = router;
router.get('/open', async (req, res) => {
    try {
        const tickets = await (0, ticketService_1.getOpenTickets)();
        res.json(tickets);
    }
    catch (error) {
        console.error('Erro ao listar tickets:', error);
        res.status(500).json({ error: 'Erro ao buscar tickets' });
    }
});
router.get('/stats', async (req, res) => {
    try {
        const db = (0, database_1.getDatabase)();
        const stats = await db.get(`
      SELECT
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent,
        SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN priority = 'medium' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN priority = 'low' THEN 1 ELSE 0 END) as low
      FROM tickets
    `);
        res.json(stats);
    }
    catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});
router.get('/attendants', async (req, res) => {
    try {
        res.json({
            attendants: attendantService_1.ATTENDANTS.map(a => ({
                id: a.id,
                name: a.name,
                whatsapp: a.whatsapp
            }))
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Erro ao buscar atendentes' });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const ticketId = parseInt(String(req.params.id));
        if (isNaN(ticketId)) {
            return res.status(400).json({ error: 'ID do ticket deve ser um número' });
        }
        const ticket = await (0, ticketService_1.getTicketById)(ticketId);
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket não encontrado' });
        }
        res.json(ticket);
    }
    catch (error) {
        console.error('Erro ao buscar ticket:', error);
        res.status(500).json({ error: 'Erro ao buscar ticket' });
    }
});
router.post('/', async (req, res) => {
    try {
        const { wa_id, subject, priority } = req.body;
        if (!wa_id || !subject) {
            return res.status(400).json({ error: 'Campos "wa_id" e "subject" são obrigatórios' });
        }
        const ticketId = await (0, ticketService_1.createTicket)(wa_id, subject, priority || 'medium');
        res.status(201).json({
            success: true,
            ticketId,
            message: 'Ticket criado com sucesso'
        });
    }
    catch (error) {
        console.error('Erro ao criar ticket:', error);
        res.status(500).json({ error: 'Erro ao criar ticket' });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const ticketId = parseInt(String(req.params.id));
        if (isNaN(ticketId)) {
            return res.status(400).json({ error: 'ID do ticket deve ser um número' });
        }
        const updates = req.body;
        const validStatus = ['open', 'in_progress', 'resolved', 'closed'];
        if (updates.status && !validStatus.includes(updates.status)) {
            return res.status(400).json({ error: 'Status inválido' });
        }
        await (0, ticketService_1.updateTicket)(ticketId, updates);
        res.json({ success: true, message: 'Ticket atualizado com sucesso' });
    }
    catch (error) {
        console.error('Erro ao atualizar ticket:', error);
        res.status(500).json({ error: 'Erro ao atualizar ticket' });
    }
});
router.post('/:id/resolve', async (req, res) => {
    try {
        const ticketId = req.params.id;
        const { resolution_message } = req.body;
        await (0, ticketService_1.updateTicket)(ticketId, {
            status: 'resolved',
        });
        const ticket = await (0, ticketService_1.getTicketById)(ticketId);
        if (ticket && resolution_message) {
            (0, whatsappService_1.sendMessage)(ticket.wa_id, `✅ *Ticket #${ticketId} resolvido!*\n\n` +
                `Mensagem da equipe:\n${resolution_message}\n\n` +
                `Agradecemos seu contato! 😊`).catch((err) => console.error('Falha ao notificar cliente (ticket resolvido mesmo assim):', err.message));
        }
        res.json({
            success: true,
            message: 'Ticket resolvido com sucesso'
        });
    }
    catch (error) {
        console.error('Erro ao resolver ticket:', error);
        res.status(500).json({ error: 'Erro ao resolver ticket' });
    }
});
router.post('/escalate', async (req, res) => {
    try {
        const { target = 'all', message, conversationId, ticketId } = req.body;
        const io = req.app.get('io');
        const validTargets = ['all', ...attendantService_1.ATTENDANTS.map(a => a.id), ...attendantService_1.ATTENDANTS.map(a => a.name.toLowerCase())];
        if (target !== 'all' && !validTargets.includes(target.toLowerCase())) {
            return res.status(400).json({
                error: `Atendente inválido. Opções válidas: "all" (todos), ou: ${attendantService_1.ATTENDANTS.map(a => a.name).join(', ')}`
            });
        }
        const result = await (0, attendantService_1.notifyHumanAttendant)({
            target: target.toLowerCase() === 'all' ? 'all' : target,
            message: message || 'Cliente pediu atendimento humano',
            conversationId,
            sendWhatsApp: true,
            emitSocket: true,
            io
        });
        if (ticketId) {
            try {
                await (0, ticketService_1.updateTicket)(ticketId, { assigned_to: target === 'all' ? 'todos' : target, status: 'in_progress' });
            }
            catch (e) {
                console.warn('Erro ao atualizar ticket no escalonamento:', e);
            }
        }
        res.json({
            success: true,
            mode: result.mode,
            message: result.mode === 'all' ? `Notificado todos (${attendantService_1.ATTENDANTS.length}) atendentes` : `Notificado ${result.name}`,
            details: result
        });
    }
    catch (error) {
        console.error('Erro ao escalonar atendimento:', error);
        res.status(500).json({ error: error.message || 'Erro ao notificar atendente' });
    }
});
//# sourceMappingURL=ticket.js.map