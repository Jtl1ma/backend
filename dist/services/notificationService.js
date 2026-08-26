"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const database_1 = require("../database/database");
const whatsappService_1 = require("./whatsappService");
class NotificationService {
    constructor(io) {
        this.db = (0, database_1.getDatabase)();
        this.io = io;
        this.setupEventHandlers();
    }
    static initialize(io) {
        if (!NotificationService.instance) {
            NotificationService.instance = new NotificationService(io);
        }
        return NotificationService.instance;
    }
    static getInstance() {
        if (!NotificationService.instance) {
            throw new Error('NotificationService not initialized. Call initialize first.');
        }
        return NotificationService.instance;
    }
    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Cliente conectado ao WebSocket:', socket.id);
            socket.on('subscribe_to_tickets', (ticketId) => {
                console.log(`Cliente ${socket.id} se inscreveu para ticket ${ticketId}`);
                console.log(`Notificar atendente responsavel pelo ticket ${ticketId}`);
            });
        });
    }
    emitNotification(event) {
        this.io.emit('notification', event);
    }
    emitToClient(clientId, event) {
        this.io.to(clientId).emit('notification', event);
    }
    async notifyAdminsAboutNewTicket(ticketId, waId) {
        const message = `📢 *Novo ticket criado!* #${ticketId}\n` +
            `Cliente: ${waId}\n` +
            `Status: aberto\n` +
            `Prioridade: verifique no painel`;
        try {
            await (0, whatsappService_1.sendMessage)(waId, message);
        }
        catch (error) {
            console.error('Erro ao notificar admin sobre novo ticket:', error);
        }
    }
    async notifyClientAboutTicketUpdate(ticketId, waId, status) {
        const message = `📢 *Ticket #${ticketId} atualizado!*\n` +
            `Novo status: ${status}\n` +
            `Para mais detalhes, acesse o sistema.`;
        try {
            await (0, whatsappService_1.sendMessage)(waId, message);
        }
        catch (error) {
            console.error('Erro ao notificar cliente sobre atualização:', error);
        }
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notificationService.js.map