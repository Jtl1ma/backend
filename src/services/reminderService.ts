import { getDatabase } from '../database/database';
import { sendMessage } from './whatsappService';
import cron from 'node-cron';
import moment from 'moment';


export async function createReminder(waId: string, message: string, scheduledFor: Date) {
  const db = getDatabase();
  await db.run(
    `INSERT INTO reminders (wa_id, message, scheduled_for) VALUES (?, ?, ?)`,
    [waId, message, scheduledFor.toISOString()]
  );
}

export function startReminderScheduler() {
  // Rodar a cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    const db = getDatabase();
    const now = new Date().toISOString();
    
    const reminders = await db.all(
      `SELECT * FROM reminders 
       WHERE scheduled_for <= ? 
       AND sent = 0`,
      [now]
    );
    
    for (const reminder of reminders) {
      await sendMessage(reminder.wa_id, `🔔 *Lembrete:*\n${reminder.message}`);
      
      await db.run(
        `UPDATE reminders SET sent = 1 WHERE id = ?`,
        [reminder.id]
      );
    }
  });
  
  // Lembretes de agendamento (24h antes)
  cron.schedule('0 9 * * *', async () => {
    const tomorrow = moment().add(1, 'day').startOf('day');
    const dayAfterTomorrow = moment().add(2, 'day').startOf('day');
    
    const schedulings = await getDatabase().all(
      `SELECT * FROM schedulings 
       WHERE date BETWEEN ? AND ? 
       AND status = 'pending'`,
      [tomorrow.toISOString(), dayAfterTomorrow.toISOString()]
    );
    
    for (const scheduling of schedulings) {
      await sendMessage(
        scheduling.wa_id,
        `🔔 *Lembrete de agendamento*\n\n` +
        `Olá! Seu agendamento está marcada para amanhã às ${moment(scheduling.date).format('HH:mm')}.\n` +
        `Qualquer dúvida, estamos à disposição! 💍`
      );
    }
  });
}