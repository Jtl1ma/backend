import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import path from 'path';

let db: Database;

export async function initializeDatabase() {
  try {
  db = await open({
    filename: path.resolve(__dirname, 'whatsapp_agente.db'),
    driver: sqlite3.Database
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

  // Corrigir bancos existentes que não têm UNIQUE no analytics
  try {
    await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_date ON analytics(date)');
  } catch (e) {
    console.warn('[DB] Analytics index já existe ou erro:', (e as Error)?.message || e);
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
    CREATE TABLE IF NOT EXISTS contacts (
      wa_id TEXT PRIMARY KEY,
      name TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed: criar admin padrão se não existir
  const adminExists = await db.get('SELECT id FROM admins WHERE username = ?', ['admin']);
  if (!adminExists) {
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.default.hash('admin_712', 10);
    await db.run(
      'INSERT INTO admins (username, password, email) VALUES (?, ?, ?)',
      ['admin', hashedPassword, 'admin@empresa.com']
    );
    console.log('✅ Admin padrão criado: admin / admin');
  }

  console.log('✅ Banco de dados inicializado com sucesso');
  return db;
  } catch (error: any) {
    console.error('Erro ao inicializar o banco de dados:', error.message);
    throw error;
  }
}

export function getDatabase() {
  if (!db) throw new Error('Database not initialized');
  return db;
}