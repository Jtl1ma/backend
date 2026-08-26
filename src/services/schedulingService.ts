import { getDatabase } from '../database/database';
import { sendMessage } from './whatsappService';
import moment from 'moment';

export interface Scheduling {
  id?: number;
  wa_id: string;
  consultant_name: string;
  date: Date;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  notes?: string;
}

export async function createScheduling(scheduling: Scheduling) {
  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO schedulings (wa_id, consultant_name, date, status, notes) 
     VALUES (?, ?, ?, ?, ?)`,
    [scheduling.wa_id, scheduling.consultant_name, scheduling.date.toISOString(), scheduling.status, scheduling.notes]
  );
  
  // Enviar confirmação
  const dateFormatted = moment(scheduling.date).format('DD/MM/YYYY HH:mm');
  await sendMessage(
    scheduling.wa_id,
    `✅ *Agendamento confirmado!*\n\n` +
    `📅 Data: ${dateFormatted}\n` +
    `👤 Colaborador(a): ${scheduling.consultant_name}\n\n` +
    `🔔 Você receberá um lembrete 24h antes!`
  );
  
  return result.lastID;
}

export async function getSchedulingsByUser(waId: string) {
  const db = getDatabase();
  return await db.all(
    `SELECT * FROM schedulings WHERE wa_id = ? ORDER BY date DESC`,
    [waId]
  );
}

export async function getUpcomingSchedulings() {
  const db = getDatabase();
  const now = new Date().toISOString();
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  
  return await db.all(
    `SELECT * FROM schedulings 
     WHERE date BETWEEN ? AND ? 
     AND status = 'pending'`,
    [now, nextWeek]
  );
}