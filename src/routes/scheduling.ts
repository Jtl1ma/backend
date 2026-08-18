import { Router, Request, Response } from 'express';
import { 
  createScheduling, 
  getSchedulingsByUser,
  getUpcomingSchedulings 
} from '../services/schedulingService';
import { sendMessage } from '../services/whatsappService';

const router = Router();

// Criar agendamento
router.post('/', async (req: Request, res: Response) => {
  try {
    const { wa_id, consultant_name, date, notes } = req.body;
    
    if (!wa_id || !date) {
      return res.status(400).json({ 
        error: 'Campos "wa_id" e "date" são obrigatórios' 
      });
    }

    const schedulingData = {
      wa_id,
      consultant_name: consultant_name || 'Consultor geral',
      date: new Date(date),
      status: 'pending' as const,
      notes
    };

    const schedulingId = await createScheduling(schedulingData);
    res.status(201).json({ 
      success: true, 
      schedulingId,
      message: 'Agendamento criado com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

// Listar agendamentos de um usuário
router.get('/user/:wa_id', async (req: Request, res: Response) => {
  try {
    const { wa_id }:any = req.params;
    const schedulings = await getSchedulingsByUser(wa_id);
    res.json(schedulings);
  } catch (error) {
    console.error('Erro ao listar agendamentos:', error);
    res.status(500).json({ error: 'Erro ao buscar agendamentos' });
  }
});

// Listar agendamentos futuros
router.get('/upcoming', async (req: Request, res: Response) => {
  try {
    const schedulings = await getUpcomingSchedulings();
    res.json(schedulings);
  } catch (error) {
    console.error('Erro ao listar agendamentos futuros:', error);
    res.status(500).json({ error: 'Erro ao buscar agendamentos futuros' });
  }
});

// Confirmar agendamento
router.post('/:id/confirm', async (req: Request, res: Response) => {
  try {
    //const schedulingId = parseInt(req.params.id);
    const schedulingId = req.params.id;
    const db = require('../database/database').getDatabase();
    
    await db.run(
      `UPDATE schedulings SET status = 'confirmed' WHERE id = ?`,
      [schedulingId]
    );
    
    // Buscar dados do agendamento para notificar cliente
    const scheduling = await db.get(
      'SELECT * FROM schedulings WHERE id = ?',
      [schedulingId]
    );
    
    if (scheduling) {
      await sendMessage(
        scheduling.wa_id,
        `✅ *Agendamento confirmado!*\n\n` +
        `📅 Data: ${new Date(scheduling.date).toLocaleDateString('pt-BR')}\n` +
        `⏰ Horário: ${new Date(scheduling.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\n` +
        `👤 Consultor(a): ${scheduling.consultant_name}\n\n` +
        `🔔 Aguardamos você! Qualquer dúvida, estamos aqui. 💍`
      );
    }
    
    res.json({ success: true, message: 'Agendamento confirmado' });
  } catch (error) {
    console.error('Erro ao confirmar agendamento:', error);
    res.status(500).json({ error: 'Erro ao confirmar agendamento' });
  }
});

// Cancelar agendamento
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    //const schedulingId = parseInt(req.params.id);
    const schedulingId = req.params.id;
    const db = require('../database/database').getDatabase();
    
    const scheduling = await db.get(
      'SELECT * FROM schedulings WHERE id = ?',
      [schedulingId]
    );
    
    await db.run(
      `UPDATE schedulings SET status = 'cancelled' WHERE id = ?`,
      [schedulingId]
    );
    
    if (scheduling) {
      await sendMessage(
        scheduling.wa_id,
        `❌ *Agendamento cancelado*\n\n` +
        `Seu agendamento foi cancelado com sucesso.\n` +
        `Para remarcar, basta nos chamar novamente. 😊`
      );
    }
    
    res.json({ success: true, message: 'Agendamento cancelado' });
  } catch (error) {
    console.error('Erro ao cancelar agendamento:', error);
    res.status(500).json({ error: 'Erro ao cancelar agendamento' });
  }
});

// Estatísticas de agendamentos
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const db = require('../database/database').getDatabase();
    
    const stats = await db.get(`
      SELECT 
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN date(date) = date('now') THEN 1 ELSE 0 END) as today
      FROM schedulings
      WHERE date >= date('now', '-30 days')
    `);
    
    res.json(stats);
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

export { router as schedulingRouter };