import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config';
import { authMiddleware } from '../middleware/auth';
import { getDatabase } from '../database/database';

const atendente = Router();

// Login do admin
atendente.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    
    // Buscar admin no banco (você precisa criar uma tabela de admins)
    const db = getDatabase();
    
    const row = await db.get(`SELECT * FROM atendentes WHERE username = ?`, [username]);
     
    if (!row) return res.status(401).json({ error: 'Credenciais inválidas' });
    
        
    const validPassword = await bcrypt.compare(password, row.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    
    if (!config.jwtSecret) {
      return res.status(500).json({ error: 'Configuração JWT inválida' });
    }

    const token = jwt.sign({ id: row.id, username: row.username },
      config.jwtSecret, { expiresIn: '24h' });
    
    res.json({
      success: true,
      token,
      atendente: {
        id: row.id,
        name: row.name,
        username: row.username,
        email: row.email,
        phone: row.phone
      },
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

atendente.post('/setup', async (req: Request, res: Response) => {
    const db = require('../database/database').getDatabase();
  try {
    const { name, username, phone, password, email } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const row = await db.all(`SELECT * FROM atendentes WHERE username = ?`, [username]);
    


    if (!row) {
      const result = await db.run(
        `INSERT INTO atendentes (name, username, phone, password, email) VALUES (?, ?, ?, ?, ?)`,
        [name, username, phone, hashedPassword, email]
      );

      const agent = (result as any);
      if (agent) {
        delete agent.password; // Remove a senha do objeto antes de enviar a resposta
    }
    
    const token = jwt.sign(
        { id: agent.id },
         config.jwtSecret!, 
         { expiresIn: '1h' }
        );

    res.status(201).json({ message: 'Atendente criado com sucesso', token });
    } else {
      res.status(400).json({ message: 'Username já existe' });
    }
    } catch (error) {
    console.error('Erro ao criar atendente:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

atendente.get('/list', async (req: Request, res: Response) => {
    const db = require('../database/database').getDatabase();
    try {
        const rows = await db.all(`SELECT id, name, username, phone, email FROM atendentes`);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Erro ao listar atendentes:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

atendente.get('/get/:name', async (req: Request, res: Response) => {
    const db = require('../database/database').getDatabase();
    const { name } = req.params;
    try {
        const row = await db.get(`SELECT id, name, username, phone, email FROM atendentes WHERE name = ?`, [name]);
        if (row) {
            res.status(200).json(row);
        } else {
            res.status(404).json({ message: 'Atendente não encontrado' });
        }
    } catch (error) {
        console.error('Erro ao buscar atendente:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

atendente.get('/get/:id', async (req: Request, res: Response) => {
    const db = require('../database/database').getDatabase();
    const { id } = req.params;
    try {
        const row = await db.get(`SELECT id, name, username, phone, email FROM atendentes WHERE id = ?`, [id]);
        if (row) {
            res.status(200).json(row);
        } else {
            res.status(404).json({ message: 'Atendente não encontrado' });
        }
    } catch (error) {
        console.error('Erro ao buscar atendente:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

atendente.put('/update/:id', async (req: Request, res: Response) => {
    const db = require('../database/database').getDatabase();
    const { id } = req.params;
    const { name, username, phone, password, email } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.run(
            `UPDATE atendentes SET name = ?, username = ?, phone = ?, password = ?, email = ? WHERE id = ?`,
            [name, username, phone, hashedPassword, email, id]
        );
        if (result) {
            res.status(200).json({ message: 'Atendente atualizado com sucesso' });
        } else {
            res.status(404).json({ message: 'Atendente não encontrado' });
        }
    } catch (error) {
        console.error('Erro ao atualizar atendente:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

atendente.delete('/delete/:id', authMiddleware, async (req: Request, res: Response) => {
    const db = require('../database/database').getDatabase();
    const { id } = req.params;
    try {
        const result = await db.run(`DELETE FROM atendentes WHERE id = ?`, [id]);
        if (result) {
            res.status(200).json({ message: 'Atendente deletado com sucesso' });
        }
        else {
            res.status(404).json({ message: 'Atendente não encontrado' });
        }
    } catch (error) {
        console.error('Erro ao deletar atendente:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

export default atendente;