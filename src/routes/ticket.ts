import { Router, Request, Response } from 'express';
import {
  createTicket,
  updateTicket,
  getTicketById,
  getOpenTickets
} from '../services/ticketService';
import { sendMessage } from '../services/whatsappService';
import { notifyHumanAttendant, ATTENDANTS } from '../services/attendantService';
import { getDatabase } from '../database/database';
const router = Router();

// Listar todos os tickets abertos
router.get('/open', async (req: Request, res: Response) => {
  try {
    const tickets = await getOpenTickets();
    res.json(tickets);
  } catch (error) {
    console.error('Erro ao listar tickets:', error);
    res.status(500).json({ error: 'Erro ao buscar tickets' });
  }
});

// Estatísticas de tickets
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();

    const stats = await db.get(`
      SELECT
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent,
        SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN priority = 'medium' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN priority = 'low' THEN 1 ELSE 0 END) as low
      FROM tickets
    `);

    res.json(stats);
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// Buscar ticket por ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(String(req.params.id));
    if (isNaN(ticketId)) {
      return res.status(400).json({ error: 'ID do ticket deve ser um número' });
    }
    const ticket = await getTicketById(ticketId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket não encontrado' });
    }

    res.json(ticket);
  } catch (error) {
    console.error('Erro ao buscar ticket:', error);
    res.status(500).json({ error: 'Erro ao buscar ticket' });
  }
});

// Criar novo ticket
router.post('/', async (req: Request, res: Response) => {
  try {
    const { wa_id, subject, priority } = req.body;
    
    if (!wa_id || !subject) {
      return res.status(400).json({ error: 'Campos "wa_id" e "subject" são obrigatórios' });
    }

    const ticketId = await createTicket(wa_id, subject, priority || 'medium');
    res.status(201).json({ 
      success: true, 
      ticketId, 
      message: 'Ticket criado com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao criar ticket:', error);
    res.status(500).json({ error: 'Erro ao criar ticket' });
  }
});

// Atualizar ticket
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(String(req.params.id));
    if (isNaN(ticketId)) {
      return res.status(400).json({ error: 'ID do ticket deve ser um número' });
    }
    const updates = req.body;
    
    // Validar status
    const validStatus = ['open', 'in_progress', 'resolved', 'closed'];
    if (updates.status && !validStatus.includes(updates.status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    await updateTicket(ticketId, updates);
    res.json({ success: true, message: 'Ticket atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar ticket:', error);
    res.status(500).json({ error: 'Erro ao atualizar ticket' });
  }
});

// Resolver ticket (método específico)
router.post('/:id/resolve', async (req: Request, res: Response) => {
  try {
    //const ticketId = parseInt(req.params.id);
    const ticketId:any = req.params.id;
    const { resolution_message } = req.body;
    
    await updateTicket(ticketId, { 
      status: 'resolved',
     // resolved_at: new Date().toISOString()
    });

    // Buscar ticket para pegar wa_id
    const ticket = await getTicketById(ticketId);
    
    if (ticket && resolution_message) {
      sendMessage(
        ticket.wa_id,
        `✅ *Ticket #${ticketId} resolvido!*\n\n` +
        `Mensagem da equipe:\n${resolution_message}\n\n` +
        `Agradecemos seu contato! 😊`
      ).catch((err) =>
        console.error('Falha ao notificar cliente (ticket resolvido mesmo assim):', err.message)
      );
    }

    res.json({
      success: true,
      message: 'Ticket resolvido com sucesso'
    });
  } catch (error) {
    console.error('Erro ao resolver ticket:', error);
    res.status(500).json({ error: 'Erro ao resolver ticket' });
  }
});

// Escalar para atendente humano (escolhido pelo cliente ou todos)
router.post('/escalate', async (req: Request, res: Response) => {
  try {
    const { target = 'all', message, conversationId, ticketId } = req.body;
    const io = req.app.get('io');

    // Se o cliente escolher, pode ser nome ou id
    const validTargets = ['all', ...ATTENDANTS.map(a => a.id), ...ATTENDANTS.map(a => a.name.toLowerCase())];

    if (target !== 'all' && !validTargets.includes(target.toLowerCase())) {
      return res.status(400).json({
        error: `Atendente inválido. Opções válidas: "all" (todos), ou: ${ATTENDANTS.map(a => a.name).join(', ')}`
      });
    }

    const result = await notifyHumanAttendant({
      target: target.toLowerCase() === 'all' ? 'all' : target,
      message: message || 'Cliente pediu atendimento humano',
      conversationId,
      sendWhatsApp: true,
      emitSocket: true,
      io
    });

    // Se tiver ticketId, atualizar status para in_progress
    if (ticketId) {
      try {
        await updateTicket(ticketId, { assigned_to: target === 'all' ? 'todos' : target, status: 'in_progress' });
      } catch (e) {
        console.warn('Erro ao atualizar ticket no escalonamento:', e);
      }
    }

    res.json({
      success: true,
      mode: result.mode,
      message: result.mode === 'all' ? `Notificado todos (${ATTENDANTS.length}) atendentes` : `Notificado ${result.name}`,
      details: result
    });
  } catch (error: any) {
    console.error('Erro ao escalonar atendimento:', error);
    res.status(500).json({ error: error.message || 'Erro ao notificar atendente' });
  }
});

// Listar atendentes disponíveis
router.get('/attendants', async (req: Request, res: Response) => {
  try {
    res.json({
      attendants: ATTENDANTS.map(a => ({
        id: a.id,
        name: a.name,
        whatsapp: a.whatsapp
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar atendentes' });
  }
});

export { router as ticketRouter };