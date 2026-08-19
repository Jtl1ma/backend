"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const database_1 = require("../database/database");
const whatsappService_1 = require("../services/whatsappService");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = __importDefault(require("../config"));
const router = (0, express_1.Router)();
exports.adminRouter = router;
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const db = (0, database_1.getDatabase)();
        const admin = await db.get('SELECT * FROM admins WHERE username = ?', [username]);
        const atendente = await db.get('SELECT * FROM atendentes WHERE username = ?', [username]);
        console.log('Dados:', admin);
        if (!admin || !atendente) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        const validPassword = await bcryptjs_1.default.compare(password, admin.password || atendente.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        const token = jsonwebtoken_1.default.sign({ id: admin.id, username: admin.username, atendente: atendente.username }, config_1.default.jwtSecret || 'secret', { expiresIn: '24h' });
        res.json({
            success: true,
            token,
            admin: {
                id: admin.id,
                username: admin.username,
                email: admin.email
            },
            atendente: {
                id: atendente.id,
                username: atendente.username,
                name: atendente.name,
                phone: atendente.phone,
                email: atendente.email
            }
        });
    }
    catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro ao fazer login' });
    }
});
router.post('/setup', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username e password são obrigatórios' });
        }
        const db = (0, database_1.getDatabase)();
        const existing = await db.get('SELECT * FROM admins WHERE username = ?', [username]);
        if (existing) {
            return res.status(400).json({ error: 'Admin já existe' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        await db.run('INSERT INTO admins (username, password, email) VALUES (?, ?, ?)', [username, hashedPassword, email || '']);
        res.json({
            success: true,
            message: 'Admin criado com sucesso'
        });
    }
    catch (error) {
        console.error('Erro ao criar admin:', error);
        res.status(500).json({ error: 'Erro ao criar admin' });
    }
});
router.post('/broadcast', async (req, res) => {
    try {
        const { message, wa_ids } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }
        const db = (0, database_1.getDatabase)();
        let users = [];
        if (wa_ids && wa_ids.length > 0) {
            users = wa_ids;
        }
        else {
            const result = await db.all('SELECT DISTINCT wa_id FROM conversations');
            users = result.map((r) => r.wa_id);
        }
        let sent = 0;
        let failed = 0;
        for (const waId of users) {
            try {
                await (0, whatsappService_1.sendMessage)(waId, `📢 *Comunicado importante*\n\n${message}`);
                sent++;
            }
            catch (error) {
                failed++;
                console.error(`Erro ao enviar para ${waId}:`, error);
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        res.json({
            success: true,
            sent,
            failed,
            total: users.length
        });
    }
    catch (error) {
        console.error('Erro no broadcast:', error);
        res.status(500).json({ error: 'Erro ao enviar broadcast' });
    }
});
router.get('/stats', async (req, res) => {
    try {
        const db = (0, database_1.getDatabase)();
        const stats = await db.get(`
      SELECT 
        (SELECT COUNT(*) FROM conversations) as total_conversations,
        (SELECT COUNT(DISTINCT wa_id) FROM conversations) as unique_users,
        (SELECT COUNT(*) FROM tickets) as total_tickets,
        (SELECT COUNT(*) FROM tickets WHERE status = 'open') as open_tickets,
        (SELECT COUNT(*) FROM schedulings) as total_schedulings,
        (SELECT COUNT(*) FROM schedulings WHERE status = 'pending') as pending_schedulings
    `);
        res.json(stats);
    }
    catch (error) {
        console.error('Erro ao buscar estatísticas do sistema:', error);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});
//# sourceMappingURL=admin.js.map