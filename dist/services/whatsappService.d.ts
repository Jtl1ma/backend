export interface WhatsAppMessage {
    from: string;
    text: string;
    timestamp: string;
}
export declare function processIncomingMessage(message: WhatsAppMessage): Promise<{
    responseText: string;
    sentiment: import("./sentimentService").Sentiment;
}>;
export declare function sendMessage(to: string, text: string): Promise<void>;
export declare function sendInteractiveMessage(to: string, text: string, buttons: any[]): Promise<void>;
export declare function fetchInstagramPosts(): Promise<any>;
//# sourceMappingURL=whatsappService.d.ts.map