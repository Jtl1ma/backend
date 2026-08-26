"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedulingRouter = void 0;
const express_1 = require("express");
const schedulingService_1 = require("../services/schedulingService");
const whatsappService_1 = require("../services/whatsappService");
const router = (0, express_1.Router)();
exports.schedulingRouter = router;
router.post('/', async (req, res) => {
    try {
        const { wa_id, consultant_name, date, notes } = req.body;
        if (!wa_id || !date) {
            return res.status(400).json({
                error: 'Campos "wa_id" e "date" são obrigatórios'
            });
        }
        const schedulingData = {
            wa_id,
            consultant_name: consultant_name || 'Consultor geral',
            date: new Date(date),
            status: 'pending',
            notes
        };
        const schedulingId = await (0, schedulingService_1.createScheduling)(schedulingData);
        res.status(201).json({
            success: true,
            schedulingId,
            message: 'Agendamento criado com sucesso'
        });
    }
    catch (error) {
        console.error('Erro ao criar agendamento:', error);
        res.status(500).json({ error: 'Erro ao criar agendamento' });
    }
});
router.get('/user/:wa_id', async (req, res) => {
    try {
        const { wa_id } = req.params;
        const schedulings = await (0, schedulingService_1.getSchedulingsByUser)(wa_id);
        res.json(schedulings);
    }
    catch (error) {
        console.error('Erro ao listar agendamentos:', error);
        res.status(500).json({ error: 'Erro ao buscar agendamentos' });
    }
});
router.get('/upcoming', async (req, res) => {
    try {
        const schedulings = await (0, schedulingService_1.getUpcomingSchedulings)();
        res.json(schedulings);
    }
    catch (error) {
        console.error('Erro ao listar agendamentos futuros:', error);
        res.status(500).json({ error: 'Erro ao buscar agendamentos futuros' });
    }
});
router.post('/:id/confirm', async (req, res) => {
    try {
        const schedulingId = req.params.id;
        const db = require('../database/database').getDatabase();
        await db.run(`UPDATE schedulings SET status = 'confirmed' WHERE id = ?`, [schedulingId]);
        const scheduling = await db.get('SELECT * FROM schedulings WHERE id = ?', [schedulingId]);
        if (scheduling) {
            await (0, whatsappService_1.sendMessage)(scheduling.wa_id, `✅ *Agendamento confirmado!*\n\n` +
                `📅 Data: ${new Date(scheduling.date).toLocaleDateString('pt-BR')}\n` +
                `⏰ Horário: ${new Date(scheduling.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\n` +
                `👤 Colaborador(a): ${scheduling.consultant_name}\n\n` +
                `🔔 Aguardamos você! Qualquer dúvida, estamos aqui. 💍`);
        }
        res.json({ success: true, message: 'Agendamento confirmado' });
    }
    catch (error) {
        console.error('Erro ao confirmar agendamento:', error);
        res.status(500).json({ error: 'Erro ao confirmar agendamento' });
    }
});
router.post('/:id/cancel', async (req, res) => {
    try {
        const schedulingId = req.params.id;
        const db = require('../database/database').getDatabase();
        const scheduling = await db.get('SELECT * FROM schedulings WHERE id = ?', [schedulingId]);
        await db.run(`UPDATE schedulings SET status = 'cancelled' WHERE id = ?`, [schedulingId]);
        if (scheduling) {
            await (0, whatsappService_1.sendMessage)(scheduling.wa_id, `❌ *Agendamento cancelado*\n\n` +
                `Seu agendamento foi cancelado com sucesso.\n` +
                `Para remarcar, basta nos chamar novamente. 😊`);
        }
        res.json({ success: true, message: 'Agendamento cancelado' });
    }
    catch (error) {
        console.error('Erro ao cancelar agendamento:', error);
        res.status(500).json({ error: 'Erro ao cancelar agendamento' });
    }
});
router.get('/stats', async (req, res) => {
    try {
        const db = require('../database/database').getDatabase();
        const stats = await db.get(`
      SELECT 
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN date(date) = date('now') THEN 1 ELSE 0 END) as today
      FROM schedulings
      WHERE date >= date('now', '-30 days')
    `);
        res.json(stats);
    }
    catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});
//# sourceMappingURL=scheduling.js.map