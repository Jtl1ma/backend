import { Server as SocketIOServer } from 'socket.io';
export interface NotificationEvent {
    type: 'new_ticket' | 'ticket_updated' | 'ticket_resolved' | 'reminder_sent' | 'system_message';
    data: any;
}
export declare class NotificationService {
    private static instance;
    private io;
    private db;
    private constructor();
    static initialize(io: SocketIOServer): NotificationService;
    static getInstance(): NotificationService;
    private setupEventHandlers;
    emitNotification(event: NotificationEvent): void;
    emitToClient(clientId: string, event: NotificationEvent): void;
    notifyAdminsAboutNewTicket(ticketId: number, waId: string): Promise<void>;
    notifyClientAboutTicketUpdate(ticketId: number, waId: string, status: string): Promise<void>;
}
//# sourceMappingURL=notificationService.d.ts.map