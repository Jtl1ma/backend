import config from '../config';
import { getDatabase } from '../database/database';
import { sendMessage } from './whatsappService';

export interface Ticket {
  id?: number;
  wa_id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  messages?: string[];
}

export async function createTicket(waId: string, subject: string, priority: string = 'medium') {
  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO tickets (wa_id, subject, status, priority) VALUES (?, ?, ?, ?)`,
    [waId, subject, 'open', priority]
  );

  // Notificar admin (não bloqueia a criação do ticket se a API externa falhar)
  notifyAdmins(`Novo ticket #${result.lastID} criado para ${waId}`).catch((err) =>
    console.error('Falha ao notificar admin (ticket criado mesmo assim):', err.message)
  );

  return result.lastID;
}

export async function updateTicket(ticketId: number, updates: Partial<Ticket>) {
  const db = getDatabase();
  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  
  await db.run(
    `UPDATE tickets SET ${fields} WHERE id = ?`,
    [...values, ticketId]
  );
  
  // Se ticket resolvido, notificar cliente (não bloqueia se a API externa falhar)
  if (updates.status === 'resolved') {
    const ticket = await getTicketById(ticketId);
    sendMessage(
      ticket.wa_id,
      `✅ *Ticket #${ticketId} resolvido!*\n\n` +
      `Seu problema foi atendido. Se precisar de mais ajuda, estamos aqui. 😊`
    ).catch((err) =>
      console.error('Falha ao notificar cliente (ticket atualizado mesmo assim):', err.message)
    );
  }
}

export async function getTicketById(id: number) {
  const db = getDatabase();
  return await db.get('SELECT * FROM tickets WHERE id = ?', [id]);
}

export async function getOpenTickets() {
  const db = getDatabase();
  return await db.all(
    `SELECT * FROM tickets WHERE status != 'resolved' AND status != 'closed' ORDER BY priority DESC`
  );
}

async function notifyAdmins(message: string) {
  // Implementar notificação para administradores (ex: via WhatsApp Business)
  const adminNumber = config.whatsApp.admin;
  if (adminNumber) {
    await sendMessage(adminNumber, `🔔 *Sistema de Tickets*\n${message}`);
  }
}