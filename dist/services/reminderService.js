"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReminder = createReminder;
exports.startReminderScheduler = startReminderScheduler;
const database_1 = require("../database/database");
const whatsappService_1 = require("./whatsappService");
const node_cron_1 = __importDefault(require("node-cron"));
const moment_1 = __importDefault(require("moment"));
async function createReminder(waId, message, scheduledFor) {
    const db = (0, database_1.getDatabase)();
    await db.run(`INSERT INTO reminders (wa_id, message, scheduled_for) VALUES (?, ?, ?)`, [waId, message, scheduledFor.toISOString()]);
}
function startReminderScheduler() {
    node_cron_1.default.schedule('*/5 * * * *', async () => {
        const db = (0, database_1.getDatabase)();
        const now = new Date().toISOString();
        const reminders = await db.all(`SELECT * FROM reminders 
       WHERE scheduled_for <= ? 
       AND sent = 0`, [now]);
        for (const reminder of reminders) {
            await (0, whatsappService_1.sendMessage)(reminder.wa_id, `🔔 *Lembrete:*\n${reminder.message}`);
            await db.run(`UPDATE reminders SET sent = 1 WHERE id = ?`, [reminder.id]);
        }
    });
    node_cron_1.default.schedule('0 9 * * *', async () => {
        const tomorrow = (0, moment_1.default)().add(1, 'day').startOf('day');
        const dayAfterTomorrow = (0, moment_1.default)().add(2, 'day').startOf('day');
        const schedulings = await (0, database_1.getDatabase)().all(`SELECT * FROM schedulings 
       WHERE date BETWEEN ? AND ? 
       AND status = 'pending'`, [tomorrow.toISOString(), dayAfterTomorrow.toISOString()]);
        for (const scheduling of schedulings) {
            await (0, whatsappService_1.sendMessage)(scheduling.wa_id, `🔔 *Lembrete de agendamento*\n\n` +
                `Olá! Seu agendamento está marcada para amanhã às ${(0, moment_1.default)(scheduling.date).format('HH:mm')}.\n` +
                `Qualquer dúvida, estamos à disposição! 💍`);
        }
    });
}
//# sourceMappingURL=reminderService.js.map