"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("./database");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
async function seed() {
    const db = await (0, database_1.initializeDatabase)();
    const hashedPassword = await bcryptjs_1.default.hash('admin123', 10);
    await db.run(`INSERT OR IGNORE INTO admins (username, password, email, is_admin) 
     VALUES (?, ?, ?, ?)`, ['admin', hashedPassword, 'admin@wedding.com', 1]);
    console.log('✅ Seed concluído com sucesso!');
    console.log('👤 Usuário: admin');
    console.log('🔑 Senha: admin123');
}
seed().catch(console.error);
//# sourceMappingURL=seed.js.map