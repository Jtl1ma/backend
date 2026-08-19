"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDatabase = initializeDatabase;
exports.getDatabase = getDatabase;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const path_1 = __importDefault(require("path"));
let db;
async function initializeDatabase() {
    try {
        db = await (0, sqlite_1.open)({
            filename: path_1.default.resolve(__dirname, '..', '../whatsapp_agente.db'),
            driver: sqlite3_1.default.Database
        });
        await db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wa_id TEXT NOT NULL,
      message TEXT,
      sentiment TEXT,
      is_weekend BOOLEAN,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wa_id TEXT NOT NULL,
      subject TEXT,
      status TEXT DEFAULT 'open',
      priority TEXT DEFAULT 'medium',
      assigned_to TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS schedulings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wa_id TEXT NOT NULL,
      consultant_name TEXT,
      date DATETIME NOT NULL,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wa_id TEXT NOT NULL,
      message TEXT NOT NULL,
      scheduled_for DATETIME NOT NULL,
      sent BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      total_conversations INTEGER DEFAULT 0,
      resolved_automated INTEGER DEFAULT 0,
      escalated_human INTEGER DEFAULT 0,
      average_response_time INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS atendentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
  `);
        return db;
    }
    catch (error) {
        console.error('Erro ao inicializar o banco de dados:', error.message);
        throw error;
    }
}
function getDatabase() {
    if (!db)
        throw new Error('Database not initialized');
    return db;
}
//# sourceMappingURL=database.js.map