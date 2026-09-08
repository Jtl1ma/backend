import axios from 'axios';
import config from '../config';

interface DjDecorConfig {
  baseUrl: string;
  apiToken?: string;
}

export class DjDecorClient {
  private client;
  
  constructor(config: DjDecorConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl || process.env.DJDECOR_URL || 'https://dj-decor.vercel.app',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiToken ? { Authorization: `Bearer ${config.apiToken}` } : {}),
      },
      timeout: 10000,
    });
  }

  // Agendamento
  async createFesta(data: {
    cliente: string;
    dataEvento: string;
    endereco: string;
    horario?: string;
    quantidadePessoas?: number;
  }) {
    return this.client.post('/api/festas', data);
  }

  async getDisponibilidade(data?: string) {
    return this.client.get('/api/estoque/disponibilidade', { params: { data } });
  }

  // Status
  async updateFestaStatus(festaId: string, status: string) {
    return this.client.patch(`/api/festas/${festaId}/status`, { status });
  }

  // Webhook IA (envia mensagem para dj-decor processar)
  async sendWebhookAtendimento(waId: string, text: string, atendente?: string) {
    return this.client.post('/api/webhooks/atendimento-ia', {
      wa_id: waId,
      mensagem: text,
      atendente: atendente || null,
    });
  }

  // Buscar festa por cliente/whatsapp
  async findByCliente(cliente: string) {
    return this.client.get('/api/festas', { params: { cliente } });
  }
}

export const djDecorClient = new DjDecorClient({
  baseUrl: process.env.DJDECOR_URL || 'https://dj-decor.vercel.app',
});

export default djDecorClient;