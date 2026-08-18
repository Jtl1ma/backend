import { Server as SocketIOServer, Socket } from 'socket.io';
import { getDatabase } from '../database/database';
import { sendMessage } from './whatsappService';

// Tipos para eventos de notificação
export interface NotificationEvent {
  type: 'new_ticket' | 'ticket_updated' | 'ticket_resolved' | 'reminder_sent' | 'system_message';
  data: any;
}

// Classe para gerenciar notificações em tempo real
export class NotificationService {
  private static instance: NotificationService;
  private io: SocketIOServer;
  private db = getDatabase();

  private constructor(io: SocketIOServer) {
    this.io = io;
    this.setupEventHandlers();
  }

  public static initialize(io: SocketIOServer): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService(io);
    }
    return NotificationService.instance;
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      throw new Error('NotificationService not initialized. Call initialize first.');
    }
    return NotificationService.instance;
  }

  private setupEventHandlers() {
    // Emitir evento para todos os clientes conectados
    this.io.on('connection', (socket: Socket) => {
      console.log('Cliente conectado ao WebSocket:', socket.id);

      // Escutar eventos específicos
      socket.on('subscribe_to_tickets', (ticketId: number) => {
        // Implementar filtragem por ticket específico
        console.log(`Cliente ${socket.id} se inscreveu para ticket ${ticketId}`);
      });
    });
  }

  // Emitir notificação para todos os clientes
  public emitNotification(event: NotificationEvent) {
    this.io.emit('notification', event);
  }

  // Emitir notificação específica para um cliente
  public emitToClient(clientId: string, event: NotificationEvent) {
    this.io.to(clientId).emit('notification', event);
  }

  // Notificar administradores sobre novo ticket
  public async notifyAdminsAboutNewTicket(ticketId: number, waId: string) {
    const message = `📢 *Novo ticket criado!* #${ticketId}\n` +
                    `Cliente: ${waId}\n` +
                    `Status: aberto\n` +
                    `Prioridade: verifique no painel`;

    try {
      await sendMessage(waId, message);
    } catch (error) {
      console.error('Erro ao notificar admin sobre novo ticket:', error);
    }
  }

  // Notificar cliente sobre atualização de ticket
  public async notifyClientAboutTicketUpdate(ticketId: number, waId: string, status: string) {
    const message = `📢 *Ticket #${ticketId} atualizado!*\n` +
                    `Novo status: ${status}\n` +
                    `Para mais detalhes, acesse o sistema.`;

    try {
      await sendMessage(waId, message);
    } catch (error) {
      console.error('Erro ao notificar cliente sobre atualização:', error);
    }
  }
}