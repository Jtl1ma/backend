import { initializeDatabase } from "./database";

async function migrate() {
  const db = await initializeDatabase();
  
  // Adicionar tabela de admins
  await db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      is_admin BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Adicionar tabela de atendentes
  await db.exec(`
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

  // Adicionar índices para performance
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversations_wa_id ON conversations(wa_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
    CREATE INDEX IF NOT EXISTS idx_tickets_wa_id ON tickets(wa_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_schedulings_wa_id ON schedulings(wa_id);
    CREATE INDEX IF NOT EXISTS idx_schedulings_date ON schedulings(date);
    CREATE INDEX IF NOT EXISTS idx_reminders_scheduled_for ON reminders(scheduled_for);
    CREATE INDEX IF NOT EXISTS idx_atendentes_username ON atendentes(username);
  `);
  
  console.log('✅ Migração concluída com sucesso!');
}

migrate().catch(console.error);

//export default migrate;