"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTicket = createTicket;
exports.updateTicket = updateTicket;
exports.getTicketById = getTicketById;
exports.getOpenTickets = getOpenTickets;
const config_1 = __importDefault(require("../config"));
const database_1 = require("../database/database");
const whatsappService_1 = require("./whatsappService");
async function createTicket(waId, subject, priority = 'medium') {
    const db = (0, database_1.getDatabase)();
    const result = await db.run(`INSERT INTO tickets (wa_id, subject, status, priority) VALUES (?, ?, ?, ?)`, [waId, subject, 'open', priority]);
    notifyAdmins(`Novo ticket #${result.lastID} criado para ${waId}`).catch((err) => console.error('Falha ao notificar admin (ticket criado mesmo assim):', err.message));
    return result.lastID;
}
async function updateTicket(ticketId, updates) {
    const db = (0, database_1.getDatabase)();
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    await db.run(`UPDATE tickets SET ${fields} WHERE id = ?`, [...values, ticketId]);
    if (updates.status === 'resolved') {
        const ticket = await getTicketById(ticketId);
        (0, whatsappService_1.sendMessage)(ticket.wa_id, `✅ *Ticket #${ticketId} resolvido!*\n\n` +
            `Seu problema foi atendido. Se precisar de mais ajuda, estamos aqui. 😊`).catch((err) => console.error('Falha ao notificar cliente (ticket atualizado mesmo assim):', err.message));
    }
}
async function getTicketById(id) {
    const db = (0, database_1.getDatabase)();
    return await db.get('SELECT * FROM tickets WHERE id = ?', [id]);
}
async function getOpenTickets() {
    const db = (0, database_1.getDatabase)();
    return await db.all(`SELECT * FROM tickets WHERE status != 'resolved' AND status != 'closed' ORDER BY priority DESC`);
}
async function notifyAdmins(message) {
    const adminNumber = config_1.default.whatsApp.admin;
    if (adminNumber) {
        await (0, whatsappService_1.sendMessage)(adminNumber, `🔔 *Sistema de Tickets*\n${message}`);
    }
}
//# sourceMappingURL=ticketService.js.map