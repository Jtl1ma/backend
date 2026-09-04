# Agente-Atendimento - Backend API

## 📋 Visão Geral
API backend para agente de atendimento com suporte a WebSocket, WhatsApp Business API e integração com Instagram Graph API.

## 🛠️ Tecnologias Utilizadas
- Node.js 20.x
- Express.js
- TypeScript
- Socket.IO (WebSocket)
- SQLite (banco de dados)
- TypeORM (ORM)
- Axios (HTTP client)
- OpenAI API (para geração de IA)
- OpenRouter API (para modelos gratuitos)

## 📦 Dependências Principais

### Produção
- `express`: Framework web
- `socket.io`: Comunicação em tempo real
- `sqlite3`: Banco de dados leve
- `typeorm`: ORM
- `axios`: Cliente HTTP
- `dotenv`: Variáveis de ambiente
- `bcryptjs`: Hash de senhas
- `jsonwebtoken`: Autenticação JWT
- `express-rate-limit`: Limite de requisições
- `helmet`: Segurança HTTP
- `express-validator`: Validação de entrada

## 📁 Estrutura de Pastas

```
src/
├── config/          # Configurações de ambiente
├── controllers/     # Controladores de requisições
├── database/        # Conexão e migrações do banco
├── middleware/      # Middlewares personalizados
├── routes/          # Rotas da API
├── services/        # Lógica de negócios
├── models/          # Modelos de dados (TypeORM)
├── utils/           # Utilitários
└── app.ts           # Arquivo principal
```

## 🔐 Variáveis de Ambiente (`.env`)

### WhatsApp Cloud API
- `WHATSAPP_ACCESS_TOKEN`: Token de acesso do WhatsApp Cloud
- `WHATSAPP_PHONE_NUMBER_ID`: ID do número do WhatsApp
- `WHATSAPP_VERIFY_TOKEN`: Token de verificação para webhook
- `WHATSAPP_API_URL`: URL do endpoint do WhatsApp

### Instagram API
- `INSTAGRAM_ACCESS_TOKEN`: Token de acesso do Instagram Graph API
- `INSTAGRAM_BUSINESS_ID`: ID da conta de negócios do Instagram
- `INSTAGRAM_API_URL`: URL para buscar posts

### OpenAI / OpenRouter
- `OPENAI_API_KEY`: Chave da API OpenAI
- `OPENROUTE_API_KEY`: Chave da API OpenRouter
- `OPENROUTE_URL`: URL base da OpenRouter
- `URL_OPENROUTE`: URL para chat completions

### Admin
- `ADMIN_WHATSAPP_NUMBER`: Número do WhatsApp do administrador
- `JWT_SECRET`: Chave secreta para JWT
- `JWT_SECRET_REFRESH`: Chave secreta para refresh token

### Outros
- `PORT`: Porta do servidor (padrão: 3333)
- `DATABASE_URL`: URL do banco de dados (preenchível com SQLite path)

## 🚀 Inicialização

```bash
# Instalar dependências
npm install

# Desenvolvimento (com hot reload)
npm run dev

# Produção
npm run build
npm start
```

## 📡 Rotas da API

### Autenticação
- `POST /auth/login` - Login do admin (requer credenciais válidas)
- `POST /auth/setup` - Criação do primeiro admin (para setup inicial)

### Webhook do WhatsApp
- `GET /webhook` - Verificação do webhook (Meta exige)
- `POST /webhook` - Recebe mensagens do WhatsApp

### Tickets
- `GET /api/tickets/open` - Listar tickets abertos
- `GET /api/tickets/:id` - Buscar ticket por ID
- `POST /api/tickets` - Criar novo ticket
- `PUT /api/tickets/:id` - Atualizar ticket
- `POST /api/tickets/:id/resolve` - Resolver ticket

### Agendamentos
- `POST /api/scheduling` - Criar agendamento
- `GET /api/scheduling/user/:wa_id` - Listar agendamentos de um usuário
- `GET /api/scheduling/upcoming` - Listar agendamentos futuros
- `POST /api/scheduling/:id/confirm` - Confirmar agendamento
- `POST /api/scheduling/:id/cancel` - Cancelar agendamento

### Dashboard e Analytics
- `GET /api/analytics/dashboard` - Dados completos do dashboard
- `GET /api/analytics/conversations` - Histórico de conversas com filtros
- `GET /api/analytics/performance` - Estatísticas de desempenho
- `GET /api/analytics/daily-report` - Relatório diário

### Instagram
- `GET /api/instagram/posts` - Buscar posts do Instagram
- `GET /api/instagram/posts/:id` - Buscar post específico

### Admin
- `POST /api/admin/broadcast` - Enviar mensagem para múltiplos usuários
- `GET /api/admin/stats` - Estatísticas do sistema

## 🌐 Deploy

### Recomendado: Ngrok
Para desenvolvimento local com acesso remoto:

```bash
npm run dev
# O ngrok será iniciado automaticamente
```

### Produção
- Use um serviço como Render, Railway ou Vercel
- Configure as variáveis de ambiente corretamente
- Configure o domínio para apontar para o servidor

## 🔒 Segurança

- Todas as rotas protegidas por `authMiddleware` exceto:
  - `/webhook`
  - `/auth/login`
  - `/auth/setup`
  - `/api/admin/broadcast`

- Uso de `helmet` para segurança HTTP
- Validação de entrada com `express-validator`
- Rate limiting para evitar abuso
- Hash de senhas com `bcryptjs`

## 🛠️ Desenvolvimento

### Banco de Dados
- O banco é SQLite armazenado em `data/data.sqlite`
- Use `npm run dev` para desenvolvimento com hot reload
- Para migrações, use ferramentas como TypeORM CLI

### Variáveis de Ambiente Essenciais
- `WHATSAPP_ACCESS_TOKEN`: Necessário para enviar mensagens
- `JWT_SECRET`: Necessário para autenticação
- `WHATSAPP_API_URL`: URL do endpoint do WhatsApp

## 📚 Documentação Adicional
- [Guia de Integração com WhatsApp Business API](docs/whatsapp-integration.md)
- [Guia de Implantação de Agendamentos](docs/scheduling.md)
- [Guia de Dashboard de Atendimento](docs/dashboard.md)
- [Guia de Integração com Instagram Graph API](docs/instagram-integration.md)

## 📞 Suporte
Para suporte, entre em contato com o time de desenvolvimento pelo canal oficial no WhatsApp.# backend
