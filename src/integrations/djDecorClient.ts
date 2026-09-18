import axios, { type AxiosInstance } from "axios";
import config from "../config";

export interface AgendaResult {
  ok: boolean;
  data: string;
  festasNoDia: number;
  disponivel: boolean;
  conflitoProximo: boolean;
  detalhe: Array<{
    id: string;
    tema: string;
    cliente: string;
    montagem: string;
    festa: string;
    status: string;
  }>;
}

export interface CriarOrcamentoInput {
  nomeCliente: string;
  telefone: string;
  tema: string;
  dataEvento: string;
  horarioMontagem: string;
  endereco: string;
  valor: number;
  tamanhoDecoracao?: "P" | "M" | "G" | "GG";
  kitCatalogo?: string | null;
  pegueEMonte?: boolean;
  itensExtras?: string[];
  observacoes?: string | null;
  vendedorId?: string;
}

/**
 * Cliente HTTP do CRM dj-decor (API no Render).
 * Base: DJDECOR_API_URL (ex.: https://dj-decor.onrender.com)
 * Auth:  DJDECOR_API_TOKEN (= IA_SERVICE_TOKEN no CRM)
 */
export class DjDecorClient {
  private client: AxiosInstance;
  private enabled: boolean;

  constructor() {
    const baseURL = (
      config.djdecor?.baseUrl ||
      process.env.DJDECOR_API_URL ||
      process.env.DJDECOR_URL ||
      ""
    ).replace(/\/$/, "");

    const apiToken =
      config.djdecor?.apiToken ||
      process.env.DJDECOR_API_TOKEN ||
      process.env.IA_SERVICE_TOKEN ||
      "";

    this.enabled = Boolean(baseURL && apiToken);

    this.client = axios.create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
        ...(apiToken
          ? {
              Authorization: `Bearer ${apiToken}`,
              "X-IA-Token": apiToken,
            }
          : {}),
      },
      timeout: 15000,
    });

    if (!this.enabled) {
      console.warn(
        "[dj-decor] Integração desligada: defina DJDECOR_API_URL e DJDECOR_API_TOKEN"
      );
    }
  }

  isEnabled() {
    return this.enabled;
  }

  /** Agenda do dia — quantas festas e se há conflito de horário. */
  async checarAgenda(data: string, horarioMontagem?: string): Promise<AgendaResult> {
    this.assertEnabled();
    const response = await this.client.get<AgendaResult>(
      "/api/integracoes/ia/agenda",
      {
        params: {
          data,
          ...(horarioMontagem ? { horarioMontagem } : {}),
        },
      }
    );
    return response.data;
  }

  /**
   * Compatível com a chamada antiga getDisponibilidade().
   * Sem data, usa o dia de hoje (America/Sao_Paulo aproximado via ISO local).
   */
  async getDisponibilidade(data?: string): Promise<AgendaResult> {
    const dia =
      data ||
      new Date().toLocaleDateString("en-CA", {
        timeZone: process.env.TIMEZONE || "America/Sao_Paulo",
      });
    return this.checarAgenda(dia);
  }

  async listCatalogo() {
    this.assertEnabled();
    const response = await this.client.get("/api/integracoes/ia/catalogo");
    return response.data;
  }

  async criarOrcamento(input: CriarOrcamentoInput) {
    this.assertEnabled();
    const response = await this.client.post(
      "/api/integracoes/ia/orcamentos",
      input
    );
    return response.data;
  }

  /** @deprecated use criarOrcamento com o payload completo do CRM */
  async createFesta(data: {
    cliente: string;
    dataEvento: string;
    endereco: string;
    horario?: string;
    telefone?: string;
    tema?: string;
    valor?: number;
  }) {
    const dataEvento = data.dataEvento;
    const horarioMontagem =
      data.horario ||
      (dataEvento.includes("T")
        ? dataEvento
        : `${dataEvento}T11:00:00.000Z`);

    return this.criarOrcamento({
      nomeCliente: data.cliente,
      telefone: data.telefone || "00000000000",
      tema: data.tema || "A definir",
      dataEvento,
      horarioMontagem,
      endereco: data.endereco,
      valor: data.valor && data.valor > 0 ? data.valor : 100,
      pegueEMonte: false,
    });
  }

  async updateFestaStatus(festaId: string, status: string) {
    this.assertEnabled();
    // Status ainda exige JWT de usuário; por enquanto só logamos.
    // Quando o CRM expor PATCH em /integracoes/ia, trocar aqui.
    console.warn(
      `[dj-decor] updateFestaStatus(${festaId}, ${status}) ainda não está na API de integração`
    );
    return { ok: false, skipped: true };
  }

  async findByTelefone(telefone: string) {
    this.assertEnabled();
    const response = await this.client.get("/api/integracoes/ia/festas", {
      params: { telefone },
    });
    return response.data;
  }

  /** @deprecated use findByTelefone */
  async findByCliente(cliente: string) {
    return this.findByTelefone(cliente);
  }

  async sendWebhookAtendimento(waId: string, text: string, atendente?: string) {
    // Endpoint legado no CRM — sem token de integração (só loga).
    const baseURL = this.client.defaults.baseURL;
    if (!baseURL) return { ok: false, skipped: true };
    const response = await axios.post(
      `${baseURL}/api/webhooks/atendimento-ia`,
      {
        wa_id: waId,
        mensagem: text,
        atendente: atendente || null,
      },
      { timeout: 10000 }
    );
    return response.data;
  }

  private assertEnabled() {
    if (!this.enabled) {
      throw new Error(
        "Integração dj-decor desligada (DJDECOR_API_URL / DJDECOR_API_TOKEN)"
      );
    }
  }
}

export const djDecorClient = new DjDecorClient();
export default djDecorClient;
