import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';

let db: Database;

export async function initializeDatabase() {
  db = await open({
    filename: './whatsapp_agent.db',
    driver: sqlite3.Database
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
  `);

  return db;
}

export function getDatabase() {
  if (!db) throw new Error('Database not initialized');
  return db;
}