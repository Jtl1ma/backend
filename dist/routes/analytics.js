"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRouter = void 0;
const express_1 = require("express");
const database_1 = require("../database/database");
const router = (0, express_1.Router)();
exports.analyticsRouter = router;
router.get('/dashboard', async (req, res) => {
    try {
        const db = (0, database_1.getDatabase)();
        const today = new Date().toISOString().split('T')[0];
        const totalToday = await db.get('SELECT SUM(total_conversations) as total FROM analytics WHERE date = ?', [today]);
        const openTickets = await db.get('SELECT COUNT(*) as count FROM tickets WHERE status != "resolved" AND status != "closed"');
        const pendingSchedulings = await db.get('SELECT COUNT(*) as count FROM schedulings WHERE status = "pending"');
        const sentimentStats = await db.get(`
      SELECT 
        SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral,
        SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative
      FROM conversations 
      WHERE date(created_at) = date('now')
    `);
        const dailyConversations = await db.all(`
      SELECT 
        strftime('%w', created_at) as day_of_week,
        COUNT(*) as count
      FROM conversations
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY day_of_week
      ORDER BY day_of_week
    `);
        const avgResponseTime = await db.get(`
      SELECT AVG(average_response_time) as avg 
      FROM analytics 
      WHERE date >= date('now', '-7 days')
    `);
        const recentConversations = await db.all(`
      SELECT c.wa_id, c.message, c.sentiment, c.created_at, co.name as clientName
      FROM conversations c
      LEFT JOIN contacts co ON c.wa_id = co.wa_id
      ORDER BY c.created_at DESC LIMIT 10
    `);
        res.json({
            totalToday: totalToday?.total || 0,
            openTickets: openTickets?.count || 0,
            pendingSchedulings: pendingSchedulings?.count || 0,
            sentiment: {
                positive: sentimentStats?.positive || 0,
                neutral: sentimentStats?.neutral || 0,
                negative: sentimentStats?.negative || 0
            },
            dailyConversations,
            avgResponseTime: Math.round(avgResponseTime?.avg || 0),
            recentConversations
        });
    }
    catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        res.status(500).json({ error: 'Erro ao carregar dados do dashboard' });
    }
});
router.get('/conversations', async (req, res) => {
    try {
        const db = (0, database_1.getDatabase)();
        const { wa_id, sentiment, start_date, end_date, limit = 50 } = req.query;
        let query = 'SELECT * FROM conversations WHERE 1=1';
        const params = [];
        if (wa_id) {
            query += ' AND wa_id = ?';
            params.push(wa_id);
        }
        if (sentiment) {
            query += ' AND sentiment = ?';
            params.push(sentiment);
        }
        if (start_date) {
            query += ' AND date(created_at) >= ?';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND date(created_at) <= ?';
            params.push(end_date);
        }
        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(Number(limit));
        const conversations = await db.all(query, params);
        res.json(conversations);
    }
    catch (error) {
        console.error('Erro ao buscar conversas:', error);
        res.status(500).json({ error: 'Erro ao buscar conversas' });
    }
});
router.get('/performance', async (req, res) => {
    try {
        const db = (0, database_1.getDatabase)();
        const { period = '7d' } = req.query;
        const days = parseInt(period) || 7;
        const stats = await db.all(`
      SELECT 
        date,
        total_conversations,
        resolved_automated,
        escalated_human,
        average_response_time
      FROM analytics
      WHERE date >= date('now', ?)
      ORDER BY date DESC
    `, [`-${days} days`]);
        const total = stats.reduce((acc, curr) => acc + curr.total_conversations, 0);
        const avgResponse = stats.reduce((acc, curr) => acc + curr.average_response_time, 0) / stats.length;
        const automatedRate = stats.reduce((acc, curr) => acc + curr.resolved_automated, 0) / total * 100;
        res.json({
            period: days,
            totalConversations: total,
            averageResponseTime: Math.round(avgResponse),
            automatedResolutionRate: Math.round(automatedRate),
            dailyData: stats
        });
    }
    catch (error) {
        console.error('Erro ao buscar performance:', error);
        res.status(500).json({ error: 'Erro ao buscar dados de performance' });
    }
});
router.get('/daily-report', async (req, res) => {
    try {
        const db = (0, database_1.getDatabase)();
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const report = await db.get(`
      SELECT 
        date,
        total_conversations,
        resolved_automated,
        escalated_human,
        average_response_time,
        (
          SELECT COUNT(*) FROM tickets 
          WHERE date(created_at) = date
        ) as tickets_created,
        (
          SELECT COUNT(*) FROM schedulings 
          WHERE date(created_at) = date
        ) as schedulings_created
      FROM analytics
      WHERE date = ?
    `, [date]);
        if (!report) {
            return res.json({
                date,
                total_conversations: 0,
                resolved_automated: 0,
                escalated_human: 0,
                average_response_time: 0,
                tickets_created: 0,
                schedulings_created: 0
            });
        }
        res.json({ relatorio: report });
    }
    catch (error) {
        console.error('Erro ao buscar relatório diário:', error);
        res.status(500).json({ error: 'Erro ao buscar relatório diário' });
    }
});
router.get('/sentiment-trend', async (req, res) => {
    try {
        const db = (0, database_1.getDatabase)();
        const { days = 30 } = req.query;
        const trend = await db.all(`
      SELECT 
        date(created_at) as date,
        SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral,
        SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative
      FROM conversations
      WHERE created_at >= datetime('now', ?)
      GROUP BY date(created_at)
      ORDER BY date
    `, [`-${days} days`]);
        res.json(trend);
    }
    catch (error) {
        console.error('Erro ao buscar tendência de sentimento:', error);
        res.status(500).json({ error: 'Erro ao buscar tendência de sentimento' });
    }
});
//# sourceMappingURL=analytics.js.map