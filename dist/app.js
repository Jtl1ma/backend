"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const database_1 = require("./database/database");
const webhook_1 = require("./routes/webhook");
const ticket_1 = require("./routes/ticket");
const scheduling_1 = require("./routes/scheduling");
const analytics_1 = require("./routes/analytics");
const instagram_1 = require("./routes/instagram");
const admin_1 = require("./routes/admin");
const reminderService_1 = require("./services/reminderService");
const auth_1 = require("./middleware/auth");
const config_1 = __importDefault(require("./config"));
const ngrok_1 = __importDefault(require("@ngrok/ngrok"));
const socket_io_1 = require("socket.io");
const http_1 = __importDefault(require("http"));
const atendente_1 = __importDefault(require("./routes/atendente"));
const helmet = require('helmet');
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const PORT = config_1.default.port || 3000;
async function startServer() {
    try {
        await (0, database_1.initializeDatabase)();
        (0, reminderService_1.startReminderScheduler)();
        const io = new socket_io_1.Server(server, {
            cors: {
                origin: '*',
                methods: ["GET", "POST"],
                credentials: true
            }
        });
        app.set('io', io);
        app.use(helmet());
        app.use((0, cors_1.default)());
        app.use(express_1.default.json({ limit: '10kb' }));
        app.use(express_1.default.urlencoded({ extended: true, limit: '10kb' }));
        app.use('/webhook', webhook_1.webhookRouter);
        app.use('/auth', admin_1.adminRouter);
        app.use('/atendente', atendente_1.default);
        app.use('/api/tickets', auth_1.authMiddleware, ticket_1.ticketRouter);
        app.use('/api/scheduling', auth_1.authMiddleware, scheduling_1.schedulingRouter);
        app.use('/api/analytics', auth_1.authMiddleware, analytics_1.analyticsRouter);
        app.use('/api/instagram', auth_1.authMiddleware, instagram_1.instagramRouter);
        app.use('/api/admin', auth_1.authMiddleware, admin_1.adminRouter);
        app.get('/health', (req, res) => {
            res.json({
                status: 'online',
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            });
        });
        app.use((err, req, res, next) => {
            console.error('Unexpected error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        });
        server.listen(PORT, () => {
            console.log('🚀 Servidor rodando na porta', PORT);
            console.log('📱 Webhook disponível em: /webhook');
            console.log('📊 Dashboard em: /api/analytics/dashboard');
            console.log('🔐 Login em: /auth/login');
            ngrok_1.default.forward({
                addr: PORT,
                authtoken_from_env: true,
            }).then(listener => {
                console.log(`✅ Ngrok URL: ${listener.url()}`);
            }).catch(error => {
                console.error('Failed to start ngrok:', error.message);
            });
        });
    }
    catch (err) {
        console.error('Error starting server:', err);
        server.close();
        process.exit(1);
    }
}
startServer().catch(console.error);
exports.default = app;
//# sourceMappingURL=app.js.map