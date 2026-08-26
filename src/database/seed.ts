import { initializeDatabase } from './database';
import bcrypt from 'bcryptjs';


async function seed() {
  const db = await initializeDatabase();
  
  // Criar admin padrão
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  await db.run(
    `INSERT OR IGNORE INTO admins (username, password, email, is_admin) 
     VALUES (?, ?, ?, ?)`,
    ['admin', hashedPassword, 'admin@wedding.com', 1],
  );
  
  console.log('✅ Seed concluído com sucesso!');
  console.log('👤 Usuário: admin');
  console.log('🔑 Senha: admin123');
}

seed().catch(console.error);