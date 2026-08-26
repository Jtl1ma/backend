import { Request, Response } from 'express';
import { getDatabase } from '../database/database';


export class AnalyticsController {
  async getDashboardData(req: Request, res: Response) {
    const db = getDatabase();
    
    // Total de conversas hoje
    const today = new Date().toISOString().split('T')[0];
    const totalToday = await db.get(
      'SELECT SUM(total_conversations) as total FROM analytics WHERE date = ?',
      [today]
    );
    
    // Tickets abertos
    const openTickets = await db.get(
      'SELECT COUNT(*) as count FROM tickets WHERE status != "resolved"'
    );
    
    // Agendamentos pendentes
    const pendingSchedulings = await db.get(
      'SELECT COUNT(*) as count FROM schedulings WHERE status = "pending"'
    );
    
    // Análise de sentimento
    const sentimentStats = await db.get(
      `SELECT 
        SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral,
        SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative
      FROM conversations WHERE date(created_at) = date('now')`
    );
    
    // Conversas por dia da semana
    const dailyConversations = await db.all(
      `SELECT 
        strftime('%w', created_at) as day_of_week,
        COUNT(*) as count
      FROM conversations
      WHERE created_at >= date('now', '-7 days')
      GROUP BY day_of_week`
    );
    
    // Tempo médio de resposta
    const avgResponseTime = await db.get(
      'SELECT AVG(average_response_time) as avg FROM analytics WHERE date >= date("now", "-7 days")'
    );
    
    res.json({
      totalToday: totalToday?.total || 0,
      openTickets: openTickets?.count || 0,
      pendingSchedulings: pendingSchedulings?.count || 0,
      sentiment: {
        positive: sentimentStats?.positive || 0,
        neutral: sentimentStats?.neutral || 0,
        negative: sentimentStats?.negative || 0
      },
      dailyConversations,
      avgResponseTime: avgResponseTime?.avg || 0
    });
  }
  
  async getConversationHistory(req: Request, res: Response) {
    const db = getDatabase();
    const { wa_id, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM conversations';
    const params: any[] = [];
    
    if (wa_id) {
      query += ' WHERE wa_id = ?';
      params.push(wa_id);
    }
    
    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(Number(limit));
    
    const conversations = await db.all(query, params);
    res.json(conversations);
  }
}