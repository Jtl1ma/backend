"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
            filename: path_1.default.resolve(__dirname, 'whatsapp_agente.db'),
            driver: sqlite3_1.default.Database
        });
        await db.exec(`
    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL UNIQUE,
      total_conversations INTEGER DEFAULT 0,
      resolved_automated INTEGER DEFAULT 0,
      escalated_human INTEGER DEFAULT 0,
      average_response_time INTEGER DEFAULT 0
    );
  `);
        try {
            await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_date ON analytics(date)');
        }
        catch (e) {
            console.warn('[DB] Analytics index já existe ou erro:', e?.message || e);
        }
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

    CREATE TABLE IF NOT EXISTS atendentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      email TEXT,
      is_admin BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

  CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      is_admin BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
        const adminExists = await db.get('SELECT id FROM admins WHERE username = ?', ['admin']);
        if (!adminExists) {
            const bcrypt = await Promise.resolve().then(() => __importStar(require('bcryptjs')));
            const hashedPassword = await bcrypt.default.hash('admin_712', 10);
            await db.run('INSERT INTO admins (username, password, email) VALUES (?, ?, ?)', ['admin', hashedPassword, 'admin@empresa.com']);
            console.log('✅ Admin padrão criado: admin / admin');
        }
        console.log('✅ Banco de dados inicializado com sucesso');
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