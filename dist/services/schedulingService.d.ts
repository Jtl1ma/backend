export interface Scheduling {
    id?: number;
    wa_id: string;
    consultant_name: string;
    date: Date;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    notes?: string;
}
export declare function createScheduling(scheduling: Scheduling): Promise<number | undefined>;
export declare function getSchedulingsByUser(waId: string): Promise<any[]>;
export declare function getUpcomingSchedulings(): Promise<any[]>;
//# sourceMappingURL=schedulingService.d.ts.map