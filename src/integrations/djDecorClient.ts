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

export interface SyncInboundResult {
  ok: boolean;
  conversaId: string;
  modo: "AI" | "HUMANO" | "HIBRIDO";
  status: string;
  shouldRunAgent: boolean;
  handoffRecorrente: boolean;
  sugerido: { vendedorId: string; vendedorNome: string } | null;
  cliente: { id: string; nome: string; telefone: string } | null;
  festaId: string | null;
  created: boolean;
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
  conversaId?: string;
}

/**
 * Cliente HTTP do CRM dj-decor (API no Render).
 * Meta continua no backend IA; CRM guarda inbox + agenda + orçamentos.
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

  async syncInbound(input: {
    waId: string;
    texto?: string | null;
    contatoNome?: string | null;
    providerMessageId?: string | null;
    timestamp?: string | Date;
  }): Promise<SyncInboundResult | null> {
    if (!this.enabled) return null;
    try {
      const response = await this.client.post<SyncInboundResult>(
        "/api/integracoes/ia/mensagens/inbound",
        input
      );
      return response.data;
    } catch (err: any) {
      console.error(
        "[dj-decor] syncInbound falhou:",
        err?.response?.data || err.message
      );
      return null;
    }
  }

  async syncOutbound(input: {
    waId: string;
    texto: string;
    conversaId?: string;
    providerMessageId?: string | null;
    autorTipo?: "AI" | "HUMANO" | "SISTEMA";
  }): Promise<{ ok: boolean; conversaId?: string } | null> {
    if (!this.enabled) return null;
    try {
      const response = await this.client.post(
        "/api/integracoes/ia/mensagens/outbound",
        input
      );
      return response.data;
    } catch (err: any) {
      console.error(
        "[dj-decor] syncOutbound falhou:",
        err?.response?.data || err.message
      );
      return null;
    }
  }

  async checarAgenda(
    data: string,
    horarioMontagem?: string
  ): Promise<AgendaResult> {
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

  async findByTelefone(telefone: string) {
    this.assertEnabled();
    const response = await this.client.get("/api/integracoes/ia/festas", {
      params: { telefone },
    });
    return response.data;
  }

  async findByCliente(cliente: string) {
    return this.findByTelefone(cliente);
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
