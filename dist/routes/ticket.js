"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ticketRouter = void 0;
const express_1 = require("express");
const ticketService_1 = require("../services/ticketService");
const whatsappService_1 = require("../services/whatsappService");
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
router.get('/:id', async (req, res) => {
    try {
        const ticketId = req.params.id;
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
        const ticketId = req.params.id;
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
//# sourceMappingURL=ticket.js.map