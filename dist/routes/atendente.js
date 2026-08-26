"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = __importDefault(require("../config"));
const auth_1 = require("../middleware/auth");
const atendente = (0, express_1.Router)();
atendente.post('/setup', async (req, res) => {
    const db = require('../database/database').getDatabase();
    try {
        const { name, username, phone, password, email } = req.body;
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const row = await db.all(`SELECT * FROM atendentes WHERE username = ?`, [username]);
        if (!row) {
            const result = await db.run(`INSERT INTO atendentes (name, username, phone, password, email) VALUES (?, ?, ?, ?, ?)`, [name, username, phone, hashedPassword, email]);
            const agent = result.lastID;
            if (agent) {
                delete agent.password;
            }
            const token = jsonwebtoken_1.default.sign({ id: agent.id }, config_1.default.jwtSecret, { expiresIn: '1h' });
            res.status(201).json({ message: 'Atendente criado com sucesso', token });
        }
        else {
            res.status(400).json({ message: 'Username já existe' });
        }
    }
    catch (error) {
        console.error('Erro ao criar atendente:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});
atendente.get('/list', async (req, res) => {
    const db = require('../database/database').getDatabase();
    try {
        const rows = await db.all(`SELECT id, name, username, phone, email FROM atendentes`);
        res.status(200).json(rows);
    }
    catch (error) {
        console.error('Erro ao listar atendentes:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});
atendente.get('/get/:name', async (req, res) => {
    const db = require('../database/database').getDatabase();
    const { name } = req.params;
    try {
        const row = await db.get(`SELECT id, name, username, phone, email FROM atendentes WHERE name = ?`, [name]);
        if (row) {
            res.status(200).json(row);
        }
        else {
            res.status(404).json({ message: 'Atendente não encontrado' });
        }
    }
    catch (error) {
        console.error('Erro ao buscar atendente:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});
atendente.get('/get/:id', async (req, res) => {
    const db = require('../database/database').getDatabase();
    const { id } = req.params;
    try {
        const row = await db.get(`SELECT id, name, username, phone, email FROM atendentes WHERE id = ?`, [id]);
        if (row) {
            res.status(200).json(row);
        }
        else {
            res.status(404).json({ message: 'Atendente não encontrado' });
        }
    }
    catch (error) {
        console.error('Erro ao buscar atendente:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});
atendente.put('/update/:id', async (req, res) => {
    const db = require('../database/database').getDatabase();
    const { id } = req.params;
    const { name, username, phone, password, email } = req.body;
    try {
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const result = await db.run(`UPDATE atendentes SET name = ?, username = ?, phone = ?, password = ?, email = ? WHERE id = ?`, [name, username, phone, hashedPassword, email, id]);
        if (result) {
            res.status(200).json({ message: 'Atendente atualizado com sucesso' });
        }
        else {
            res.status(404).json({ message: 'Atendente não encontrado' });
        }
    }
    catch (error) {
        console.error('Erro ao atualizar atendente:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});
atendente.delete('/delete/:id', auth_1.authMiddleware, async (req, res) => {
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
    }
    catch (error) {
        console.error('Erro ao deletar atendente:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});
exports.default = atendente;
//# sourceMappingURL=atendente.js.map