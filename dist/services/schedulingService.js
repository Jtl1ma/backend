"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createScheduling = createScheduling;
exports.getSchedulingsByUser = getSchedulingsByUser;
exports.getUpcomingSchedulings = getUpcomingSchedulings;
const database_1 = require("../database/database");
const whatsappService_1 = require("./whatsappService");
const moment_1 = __importDefault(require("moment"));
async function createScheduling(scheduling) {
    const db = (0, database_1.getDatabase)();
    const result = await db.run(`INSERT INTO schedulings (wa_id, consultant_name, date, status, notes) 
     VALUES (?, ?, ?, ?, ?)`, [scheduling.wa_id, scheduling.consultant_name, scheduling.date.toISOString(), scheduling.status, scheduling.notes]);
    const dateFormatted = (0, moment_1.default)(scheduling.date).format('DD/MM/YYYY HH:mm');
    await (0, whatsappService_1.sendMessage)(scheduling.wa_id, `✅ *Agendamento confirmado!*\n\n` +
        `📅 Data: ${dateFormatted}\n` +
        `👤 Colaborador(a): ${scheduling.consultant_name}\n\n` +
        `🔔 Você receberá um lembrete 24h antes.`);
    return result.lastID;
}
async function getSchedulingsByUser(waId) {
    const db = (0, database_1.getDatabase)();
    return await db.all(`SELECT * FROM schedulings WHERE wa_id = ? ORDER BY date DESC`, [waId]);
}
async function getUpcomingSchedulings() {
    const db = (0, database_1.getDatabase)();
    const now = new Date().toISOString();
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return await db.all(`SELECT * FROM schedulings 
     WHERE date BETWEEN ? AND ? 
     AND status = 'pending'`, [now, nextWeek]);
}
//# sourceMappingURL=schedulingService.js.map