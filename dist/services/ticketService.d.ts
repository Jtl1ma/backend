export interface Ticket {
    id?: number;
    wa_id: string;
    subject: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    assigned_to?: string;
    messages?: string[];
}
export declare function createTicket(waId: string, subject: string, priority?: string): Promise<number | undefined>;
export declare function updateTicket(ticketId: number, updates: Partial<Ticket>): Promise<void>;
export declare function getTicketById(id: number): Promise<any>;
export declare function getOpenTickets(): Promise<any[]>;
//# sourceMappingURL=ticketService.d.ts.map