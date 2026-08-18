import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/database';
import { sendMessage } from '../services/whatsappService';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config';

const router = Router();

// Login do admin
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    
    // Buscar admin no banco (você precisa criar uma tabela de admins)
    const db = getDatabase();
    const admin = await db.get(
      'SELECT * FROM admins WHERE username = ?',
      [username]
    );
    const atendente = await db.get(
      'SELECT * FROM atendentes WHERE username = ?',
      [username]
    );
    
    if (!admin && !atendente) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    
    const validPassword = await bcrypt.compare(password, admin.password || atendente.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    
    const token = jwt.sign(
      { id: admin.id, username: admin.username, atendente: atendente.username },
      config.jwtSecret || 'secret',
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email
      },
      atendente: {
        id: atendente.id,
        username: atendente.username,
        name: atendente.name,
        phone: atendente.phone,
        email: atendente.email
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Criar admin (apenas para setup)
router.post('/setup', async (req: Request, res: Response) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password são obrigatórios' });
    }
    
    const db = getDatabase();
    
    // Verificar se admin já existe
    const existing = await db.get(
      'SELECT * FROM admins WHERE username = ?',
      [username]
    );
    
    if (existing) {
      return res.status(400).json({ error: 'Admin já existe' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await db.run(
      'INSERT INTO admins (username, password, email) VALUES (?, ?, ?)',
      [username, hashedPassword, email || '']
    );
    
    res.json({ 
      success: true, 
      message: 'Admin criado com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao criar admin:', error);
    res.status(500).json({ error: 'Erro ao criar admin' });
  }
});

// Broadcast (enviar mensagem para todos os usuários)
router.post('/broadcast', async (req: Request, res: Response) => {
  try {
    const { message, wa_ids } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Mensagem é obrigatória' });
    }
    
    const db = getDatabase();
    
    let users: string[] = [];
    
    if (wa_ids && wa_ids.length > 0) {
      users = wa_ids;
    } else {
      // Buscar todos os wa_ids únicos das conversas
      const result = await db.all(
        'SELECT DISTINCT wa_id FROM conversations'
      );
      users = result.map((r: any) => r.wa_id);
    }
    
    let sent = 0;
    let failed = 0;
    
    for (const waId of users) {
      try {
        await sendMessage(waId, `📢 *Comunicado importante*\n\n${message}`);
        sent++;
      } catch (error) {
        failed++;
        console.error(`Erro ao enviar para ${waId}:`, error);
      }
      
      // Delay para evitar rate limit
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    res.json({
      success: true,
      sent,
      failed,
      total: users.length
    });
  } catch (error) {
    console.error('Erro no broadcast:', error);
    res.status(500).json({ error: 'Erro ao enviar broadcast' });
  }
});

// Estatísticas do sistema
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    
    const stats = await db.get(`
      SELECT 
        (SELECT COUNT(*) FROM conversations) as total_conversations,
        (SELECT COUNT(DISTINCT wa_id) FROM conversations) as unique_users,
        (SELECT COUNT(*) FROM tickets) as total_tickets,
        (SELECT COUNT(*) FROM tickets WHERE status = 'open') as open_tickets,
        (SELECT COUNT(*) FROM schedulings) as total_schedulings,
        (SELECT COUNT(*) FROM schedulings WHERE status = 'pending') as pending_schedulings
    `);
    
    res.json(stats);
  } catch (error) {
    console.error('Erro ao buscar estatísticas do sistema:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

export { router as adminRouter };