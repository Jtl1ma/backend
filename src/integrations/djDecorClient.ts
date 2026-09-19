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
  notasInternas?: string | null;
  foraParacambi?: boolean;
  origem?: string | null;
  vendedorId?: string;
  conversaId?: string;
  montadorEquipeId?: string | null;
  desmontadorEquipeId?: string | null;
  /** Se true, CRM fecha a festa (FECHADO) após criar. */
  fechar?: boolean;
}

export interface CatalogoKit {
  id: string;
  nome: string;
  categoria: string;
  descricaoCurta: string | null;
  valorEquipe: number;
  valorPegueEMonte: number | null;
  tamanhoSugerido: "P" | "M" | "G" | "GG";
  itens: string[];
}

export interface CatalogoAddon {
  id: string;
  nome: string;
  valor: number;
  tipo: string;
}

export interface CatalogoBola {
  id: string;
  nome: string;
  descricao?: string | null;
  valorTabela: number;
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
    )
      .trim()
      .replace(/\/$/, "");

    const apiToken = this.readToken();

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
    } else {
      console.log(
        `[dj-decor] token carregado len=${apiToken.length} tail=${apiToken.slice(-4)}`
      );
    }
  }

  private readToken(): string {
    const raw =
      process.env.DJDECOR_API_TOKEN ||
      process.env.IA_SERVICE_TOKEN ||
      config.djdecor?.apiToken ||
      "";
    return String(raw)
      .trim()
      .replace(/^Bearer\s+/i, "")
      .replace(/^["']|["']$/g, "")
      .trim();
  }

  tokenFingerprint(): { len: number; head: string; tail: string } | null {
    const token = this.readToken();
    if (!token) return null;
    return {
      len: token.length,
      head: token.slice(0, 4),
      tail: token.slice(-4),
    };
  }

  isEnabled() {
    return this.enabled;
  }

  private authHeaders(): Record<string, string> {
    const token = this.readToken();
    if (!token) return {};
    return {
      Authorization: `Bearer ${token}`,
      "X-IA-Token": token,
    };
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
        input,
        { headers: this.authHeaders() }
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
        input,
        { headers: this.authHeaders() }
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

  async getConversa(conversaId: string) {
    this.assertEnabled();
    const response = await this.client.get(
      `/api/integracoes/ia/conversas/${conversaId}`,
      { headers: this.authHeaders() }
    );
    return response.data;
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
        headers: this.authHeaders(),
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

  async listCatalogo(): Promise<{
    kits: CatalogoKit[];
    addons: CatalogoAddon[];
    bolas?: CatalogoBola[];
  }> {
    this.assertEnabled();
    const response = await this.client.get("/api/integracoes/ia/catalogo", {
      headers: this.authHeaders(),
    });
    return response.data;
  }

  async criarOrcamento(input: CriarOrcamentoInput) {
    this.assertEnabled();
    const response = await this.client.post(
      "/api/integracoes/ia/orcamentos",
      input,
      { headers: this.authHeaders(), timeout: 60000 }
    );
    return response.data as {
      ok: boolean;
      festa: {
        id: string;
        status: string;
        tema: string;
        valor: number;
        [key: string]: unknown;
      };
      portal?: { url: string; token: string } | null;
      contrato?: { id: string; pdfUrl: string; geradoEm: string } | null;
    };
  }

  async findByTelefone(telefone: string) {
    this.assertEnabled();
    const response = await this.client.get("/api/integracoes/ia/festas", {
      params: { telefone },
      headers: this.authHeaders(),
    });
    return response.data;
  }

  async buscarReferencias(params: {
    tema?: string;
    limite?: number;
  }): Promise<{
    ok: boolean;
    tema: string | null;
    fallback: boolean;
    total: number;
    imagens: Array<{
      id: string;
      url: string;
      tema: string | null;
      caption: string;
      tipo: string;
    }>;
  }> {
    this.assertEnabled();
    const response = await this.client.get("/api/integracoes/ia/referencias", {
      params: {
        ...(params.tema ? { tema: params.tema } : {}),
        limite: params.limite ?? 3,
      },
      headers: this.authHeaders(),
    });
    return response.data;
  }

  async findByCliente(cliente: string) {
    return this.findByTelefone(cliente);
  }

  async pingCrm(): Promise<{ ok: boolean; status?: number; error?: string }> {
    if (!this.enabled) {
      return { ok: false, error: "DJDECOR_API_URL/TOKEN ausentes" };
    }
    try {
      const dia = new Date().toLocaleDateString("en-CA", {
        timeZone: process.env.TIMEZONE || "America/Sao_Paulo",
      });
      const response = await this.client.get("/api/integracoes/ia/agenda", {
        params: { data: dia },
        headers: this.authHeaders(),
        validateStatus: () => true,
      });
      if (response.status >= 200 && response.status < 300) {
        return { ok: true, status: response.status };
      }
      return {
        ok: false,
        status: response.status,
        error:
          typeof response.data === "object"
            ? JSON.stringify(response.data)
            : String(response.data),
      };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
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
