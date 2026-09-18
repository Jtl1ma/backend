import config, { resolveChatModels } from "../config";
import {
  djDecorClient,
  type CatalogoAddon,
  type CatalogoKit,
  type CriarOrcamentoInput,
} from "../integrations/djDecorClient";
import { notifyHumanAttendant } from "./attendantService";
import { generateAIResponse } from "./aiService";
import { isWeekend } from "../utils/dateUtils";

const SYSTEM_PROMPT = `Você é a *Debysinha*, amiga carinhosa da Débora Pimentel Decoradora (Paracambi - RJ | @debora_pimentel_decoradora).

Fale como uma pessoa real no WhatsApp: natural, calorosa, com ritmo de conversa. Nunca pareça script, robô ou formulário.

Como conversar:
- Leia a intenção (oi, “tá ocupada?”, “tem campanha?”, quero orçamento…).
- Cumprimento / “posso falar?” / “tá ocupada?” → acolha com leveza e espere. Sem pedir data/kit ainda.
- Se perguntarem de campanha, promoção, VIP ou Instagram → use as campanhas/posts do contexto e explique com carinho (Festa na Mesa VIP, palavra CURIOSA se estiver no post, preços do catálogo). Ofereça fechar AQUI no chat, sem mandar para outro WhatsApp.
- Se pedirem decoração/kit → avance com 1–2 dicas + pergunta natural.
- Varie o jeito de falar. Não repita a mesma frase da mensagem anterior.
- 2–5 frases. Emojis leves.

Venda (quando o assunto for festa):
- Tools para preço, agenda e criar_venda. Não invente valor.
- Festa na Mesa: R$100 / R$130 / R$160, pegue-e-monte no depósito (leva/busca +R$30).
- Confirme antes de criar_venda (confirmadoPeloCliente=true).
- Reclamação/desconto fora do padrão → escalar_humano.
`;

function isCampaignAsk(text: string): boolean {
  return /\b(campanha|promo|promo[cç][aã]o|desconto|vip|curios[oa]|instagram|stories?)\b/i.test(
    text
  );
}

function isSoftOpener(text: string): boolean {
  const t = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
  if (!t || t.length > 90) return false;
  if (isCampaignAsk(t)) return false;
  const hasSaleIntent =
    /(festa|decor|mesa|orcamento|orçamento|agendar|kit|preco|preço|pacote|valor|contrato|bolas|casamento|anivers)/i.test(
      t
    );
  if (hasSaleIntent) return false;
  return (
    /^(oi|ola|olá|oie|eai|e ai|bom dia|boa tarde|boa noite)\b/.test(t) ||
    /\b(posso falar|pode falar|tem um minutinho|um minuto|tudo bem|td bem|como vai|ta ocupada|tá ocupada|ocupada\?)\b/.test(
      t
    ) ||
    /^(oi|ola|olá).{0,40}(boa noite|bom dia|boa tarde)/.test(t)
  );
}

function summarizeCampaigns(
  posts?: Array<{ caption?: string; permalink?: string }>
): string {
  if (!posts?.length) return "";
  return posts
    .slice(0, 3)
    .map((p, i) => {
      const cap = String(p.caption || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 320);
      return `${i + 1}. ${cap}${p.permalink ? ` (${p.permalink})` : ""}`;
    })
    .join("\n");
}

function campaignFallbackReply(
  posts: Array<{ caption?: string; permalink?: string }> | undefined,
  contactName?: string | null
): string {
  const nome = contactName?.split(/\s+/)[0];
  const joined = (posts || []).map((p) => p.caption || "").join(" \n ");
  const hasVip = /festa na mesa|curios|vip/i.test(joined);
  const link = posts?.find((p) => p.permalink)?.permalink;

  if (hasVip) {
    return (
      (nome ? `${nome}, tenho sim! 💛 ` : "Tenho sim! 💛 ") +
      `Está rolando campanha VIP da *Festa na Mesa* no Instagram` +
      (link ? ` (${link})` : "") +
      `. Os pacotes são R$100, R$130 e R$160 no pegue e monte — e a brincadeira do post é com a palavra *CURIOSA*. Quer que eu te explique e já feche por aqui?`
    );
  }
  if (posts?.length) {
    const teaser = String(posts[0].caption || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    return (
      (nome ? `${nome}, sim! 💛 ` : "Sim! 💛 ") +
      `No Instagram está assim: “${teaser}…”. Quer que eu te conte os detalhes e encaixe no orçamento?`
    );
  }
  return nome
    ? `${nome}, deixa eu te contar com carinho 💛 Temos a Festa na Mesa (R$100, R$130 e R$160). Quer que eu veja se tem condição especial pra você?`
    : "Deixa eu te contar com carinho 💛 Temos a Festa na Mesa (R$100, R$130 e R$160). Quer que eu veja se tem condição especial pra você?";
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "listar_catalogo",
      description: "Lista kits e add-ons com preços oficiais do CRM.",
      parameters: { type: "object", properties: {}, required: [] as string[] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "montar_orcamento",
      description:
        "Calcula total a partir de kit, pegue-e-monte, add-ons e taxa de entrega.",
      parameters: {
        type: "object",
        properties: {
          kitId: { type: "string" },
          pegueEMonte: { type: "boolean" },
          addonIds: { type: "array", items: { type: "string" } },
          taxaEntrega: { type: "boolean" },
        },
        required: ["kitId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "checar_agenda",
      description: "Consulta festas no dia no CRM.",
      parameters: {
        type: "object",
        properties: {
          dataEvento: { type: "string" },
          horarioMontagem: { type: "string" },
        },
        required: ["dataEvento"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "historico_cliente",
      description: "Busca festas anteriores pelo telefone.",
      parameters: {
        type: "object",
        properties: { telefone: { type: "string" } },
        required: ["telefone"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "criar_venda",
      description:
        "Cria orçamento/festa no CRM após confirmação explícita do cliente.",
      parameters: {
        type: "object",
        properties: {
          nomeCliente: { type: "string" },
          telefone: { type: "string" },
          tema: { type: "string" },
          dataEvento: { type: "string" },
          horarioMontagem: { type: "string" },
          endereco: { type: "string" },
          valor: { type: "number" },
          tamanhoDecoracao: {
            type: "string",
            enum: ["P", "M", "G", "GG"],
          },
          kitCatalogo: { type: "string" },
          pegueEMonte: { type: "boolean" },
          itensExtras: { type: "array", items: { type: "string" } },
          observacoes: { type: "string" },
          notasInternas: { type: "string" },
          foraParacambi: { type: "boolean" },
          confirmadoPeloCliente: { type: "boolean" },
        },
        required: [
          "nomeCliente",
          "telefone",
          "tema",
          "dataEvento",
          "horarioMontagem",
          "endereco",
          "valor",
          "confirmadoPeloCliente",
        ],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "escalar_humano",
      description: "Pede intervenção humana.",
      parameters: {
        type: "object",
        properties: { motivo: { type: "string" } },
        required: ["motivo"],
      },
    },
  },
];

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

interface FunnelContext {
  waId: string;
  contactName?: string | null;
  conversaId?: string | null;
  vendedorId?: string | null;
  cliente?: { id: string; nome: string; telefone: string } | null;
  festaId?: string | null;
}

let catalogCache: { kits: CatalogoKit[]; addons: CatalogoAddon[] } | null = null;
let catalogCacheAt = 0;

async function getCatalog() {
  const now = Date.now();
  if (catalogCache && now - catalogCacheAt < 5 * 60 * 1000) return catalogCache;
  catalogCache = await djDecorClient.listCatalogo();
  catalogCacheAt = now;
  return catalogCache;
}

function catalogSummary(cat: { kits: CatalogoKit[]; addons: CatalogoAddon[] }) {
  const kits = cat.kits
    .slice(0, 14)
    .map((k) => {
      const pe =
        k.valorPegueEMonte != null ? ` | pegue R$${k.valorPegueEMonte}` : "";
      return `- ${k.id}: ${k.nome} — equipe R$${k.valorEquipe}${pe}`;
    })
    .join("\n");
  return `Catálogo (use estes preços):\n${kits}`;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeToolCalls(choice: any): Array<{
  id: string;
  name: string;
  arguments: string;
}> {
  const raw = choice?.tool_calls || choice?.toolCalls || [];
  if (!Array.isArray(raw) || raw.length === 0) return [];

  return raw
    .map((call: any, i: number) => {
      const name =
        call?.function?.name ||
        call?.name ||
        call?.function_name ||
        "";
      const args =
        call?.function?.arguments ??
        call?.arguments ??
        "{}";
      const id = call?.id || `call_${i}_${name || "tool"}`;
      return {
        id: String(id),
        name: String(name || ""),
        arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}),
      };
    })
    .filter((c) => c.name);
}

function toDay(dataEvento: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(dataEvento)) return dataEvento.slice(0, 10);
  const d = new Date(dataEvento);
  if (Number.isNaN(d.getTime())) return dataEvento;
  return d.toLocaleDateString("en-CA", {
    timeZone: process.env.TIMEZONE || "America/Sao_Paulo",
  });
}

function sanitizeReply(text: string): string {
  let t = String(text || "").trim();
  if (!t) return "";
  if (/^user safety/i.test(t) || t.toLowerCase() === "safe") {
    return "Me conta: qual data da festa e se prefere Festa na Mesa (R$100, R$130 ou R$160)? 😊";
  }
  // Evita repetir o fallback antigo
  if (/em que posso te ajudar na festa\?/i.test(t) && t.length < 80) {
    return "";
  }
  return t;
}

async function dispatchTool(
  name: string,
  argsJson: string,
  ctx: FunnelContext
): Promise<unknown> {
  const args = parseArgs(argsJson);

  switch (name) {
    case "listar_catalogo": {
      const cat = await getCatalog();
      return {
        ok: true,
        kits: cat.kits.map((k) => ({
          id: k.id,
          nome: k.nome,
          valorEquipe: k.valorEquipe,
          valorPegueEMonte: k.valorPegueEMonte,
          tamanhoSugerido: k.tamanhoSugerido,
          itens: k.itens,
        })),
        addons: cat.addons.map((a) => ({
          id: a.id,
          nome: a.nome,
          valor: a.valor,
        })),
      };
    }

    case "montar_orcamento": {
      const cat = await getCatalog();
      const kitId = String(args.kitId ?? "");
      const kit = cat.kits.find((k) => k.id === kitId);
      if (!kit) return { ok: false, error: "Kit não encontrado" };
      const pegueEMonte = Boolean(args.pegueEMonte);
      const taxaEntrega = Boolean(args.taxaEntrega);
      const addonIds = Array.isArray(args.addonIds)
        ? args.addonIds.map(String)
        : [];
      const base = pegueEMonte
        ? Number(kit.valorPegueEMonte ?? kit.valorEquipe)
        : Number(kit.valorEquipe);
      const addons = cat.addons.filter((a) => addonIds.includes(a.id));
      const valorAddons = addons.reduce((s, a) => s + Number(a.valor), 0);
      const taxa = pegueEMonte && taxaEntrega ? 30 : 0;
      const itensTaxa =
        taxa > 0
          ? [`Taxa entrega/busca R$ ${taxa.toFixed(2).replace(".", ",")}`]
          : [];
      return {
        ok: true,
        kitId: kit.id,
        kit: kit.nome,
        tamanhoSugerido: kit.tamanhoSugerido,
        valorBase: base,
        valorAddons,
        valorTaxa: taxa,
        total: base + valorAddons + taxa,
        itens: [...kit.itens, ...addons.map((a) => a.nome), ...itensTaxa],
        pegueEMonte,
      };
    }

    case "checar_agenda": {
      const dataEvento = String(args.dataEvento ?? "");
      const horario = args.horarioMontagem
        ? String(args.horarioMontagem)
        : undefined;
      const agenda = await djDecorClient.checarAgenda(
        toDay(dataEvento),
        horario
      );
      return { ...agenda, ok: true };
    }

    case "historico_cliente": {
      const telefone = String(args.telefone || ctx.waId);
      return djDecorClient.findByTelefone(telefone);
    }

    case "criar_venda": {
      if (!args.confirmadoPeloCliente) {
        return {
          ok: false,
          error: "Peça confirmação explícita antes de criar a venda.",
        };
      }
      if (ctx.festaId) {
        return {
          ok: false,
          error: `Já existe festa vinculada (${ctx.festaId}).`,
        };
      }

      const cat = await getCatalog();
      const kitId = args.kitCatalogo ? String(args.kitCatalogo) : null;
      const kit = kitId ? cat.kits.find((k) => k.id === kitId) : null;
      const pegueEMonte =
        args.pegueEMonte != null
          ? Boolean(args.pegueEMonte)
          : Boolean(kitId?.startsWith("festa-mesa"));

      let itensExtras = Array.isArray(args.itensExtras)
        ? args.itensExtras.map(String)
        : [];
      if (itensExtras.length === 0 && kit) itensExtras = [...kit.itens];

      let endereco = String(args.endereco || "").trim();
      if (pegueEMonte && (!endereco || endereco.length < 5)) {
        endereco =
          "Depósito Débora Pimentel — Paracambi/RJ (pegue e monte)";
      }

      const foraParacambi =
        args.foraParacambi != null
          ? Boolean(args.foraParacambi)
          : !pegueEMonte &&
            endereco.length >= 5 &&
            !endereco.toLowerCase().includes("paracambi");

      const tamanho = (String(
        args.tamanhoDecoracao || kit?.tamanhoSugerido || "M"
      ) || "M") as "P" | "M" | "G" | "GG";

      const payload: CriarOrcamentoInput = {
        nomeCliente: String(args.nomeCliente || ctx.contactName || "Cliente"),
        telefone: String(args.telefone || ctx.cliente?.telefone || ctx.waId),
        tema: String(args.tema),
        dataEvento: String(args.dataEvento),
        horarioMontagem: String(args.horarioMontagem),
        endereco,
        valor: Number(args.valor),
        tamanhoDecoracao: tamanho,
        kitCatalogo: kitId,
        pegueEMonte,
        itensExtras,
        observacoes: args.observacoes
          ? String(args.observacoes)
          : "Criado pela Debysinha (WhatsApp)",
        notasInternas: args.notasInternas ? String(args.notasInternas) : null,
        foraParacambi,
        origem: "WhatsApp",
        conversaId: ctx.conversaId || undefined,
        vendedorId: ctx.vendedorId || undefined,
      };

      try {
        const created = await djDecorClient.criarOrcamento(payload);
        if (created?.festa?.id) ctx.festaId = created.festa.id;
        return created;
      } catch (err: any) {
        return {
          ok: false,
          error: err?.response?.data || err?.message || "Falha ao criar venda",
        };
      }
    }

    case "escalar_humano": {
      const motivo = String(args.motivo || "Cliente pediu humano");
      await notifyHumanAttendant({
        target: "all",
        message: `Escalado pela Debysinha (${ctx.contactName || ctx.waId}): ${motivo}`,
        conversationId: ctx.waId,
        sendWhatsApp: true,
      }).catch((e) => console.error("Falha escalar_humano:", e?.message));
      return { ok: true, escalado: true, motivo };
    }

    default:
      return { ok: false, error: `Tool desconhecida: ${name}` };
  }
}

async function openRouterChat(params: {
  messages: ChatMessage[];
  withTools: boolean;
  models: string[];
}): Promise<any> {
  const openRouterUrl =
    config.openrout.openUrl ||
    config.openrout.url ||
    "https://openrouter.ai/api/v1/chat/completions";

  let lastError: Error | null = null;
  for (const model of params.models) {
    try {
      const body: Record<string, unknown> = {
        model,
        messages: params.messages,
        temperature: 0.5,
        max_tokens: 420,
      };
      if (params.withTools) {
        body.tools = TOOLS;
        body.tool_choice = "auto";
      }

      const response = await fetch(openRouterUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openrout.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(
          `${model} HTTP ${response.status}: ${errBody.slice(0, 180)}`
        );
      }

      const data = await response.json();
      if (!data?.choices?.[0]) throw new Error(`${model} sem choices`);
      console.log(`[funil] ok model=${model} tools=${params.withTools}`);
      return data;
    } catch (err: any) {
      lastError = err;
      console.warn(`[funil] fail ${model}:`, err?.message || err);
    }
  }
  throw lastError || new Error("Nenhum modelo respondeu");
}

function uniqueModels(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const m of list) {
      if (!m || seen.has(m)) continue;
      // Evita IDs inventados que só gastam tentativa
      if (/^gpt-5\./i.test(m)) continue;
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

/**
 * Funil de vendas com tools + fallback de texto (nunca responde a mesma frase fixa).
 */
export async function runSalesFunnel(params: {
  userMessage: string;
  waId: string;
  contactName?: string | null;
  conversaId?: string | null;
  vendedorId?: string | null;
  cliente?: { id: string; nome: string; telefone: string } | null;
  festaId?: string | null;
  posts?: Array<{ caption?: string; permalink?: string }>;
}): Promise<{ responseText: string; festaId?: string | null }> {
  const ctx: FunnelContext = {
    waId: params.waId,
    contactName: params.contactName,
    conversaId: params.conversaId,
    vendedorId: params.vendedorId,
    cliente: params.cliente,
    festaId: params.festaId,
  };

  // Abertura social: tenta o modelo inteligente primeiro; só usa frase pronta se falhar
  if (isSoftOpener(params.userMessage)) {
    try {
      const soft = await runSalesFunnelInner(
        {
          ...params,
          // Hint leve no user message wrapper via posts only — prompt já cobre
        },
        ctx,
        { forceNoTools: true, socialOnly: true }
      );
      if (soft.responseText) return soft;
    } catch (err: any) {
      console.warn("[funil] soft opener LLM falhou:", err?.message || err);
    }
    const nome = params.contactName?.split(/\s+/)[0];
    return {
      responseText: nome
        ? `Oi, ${nome}! Claro 💛 Pode falar, tô aqui sim.`
        : "Oi! Claro 💛 Pode falar, tô aqui sim.",
      festaId: ctx.festaId,
    };
  }

  // Pergunta de campanha: se o LLM falhar, responde com o post real do Instagram
  if (isCampaignAsk(params.userMessage)) {
    try {
      return await runSalesFunnelInner(params, ctx);
    } catch (err: any) {
      console.warn("[funil] campanha LLM falhou:", err?.message || err);
      return {
        responseText: campaignFallbackReply(params.posts, params.contactName),
        festaId: ctx.festaId,
      };
    }
  }

  try {
    return await runSalesFunnelInner(params, ctx);
  } catch (err: any) {
    console.error("[funil] erro fatal, fallback generateAI:", err?.message || err);
    if (isCampaignAsk(params.userMessage)) {
      return {
        responseText: campaignFallbackReply(params.posts, params.contactName),
        festaId: ctx.festaId,
      };
    }
    try {
      const text = await generateAIResponse(
        params.userMessage,
        "neutral",
        isWeekend(),
        params.posts || [],
        params.contactName || undefined
      );
      const clean = sanitizeReply(text);
      if (clean) return { responseText: clean, festaId: ctx.festaId };
    } catch (e2: any) {
      console.error("[funil] generateAI também falhou:", e2?.message || e2);
    }
    const nome = params.contactName?.split(" ")[0];
    if (/festa na mesa|mesa/i.test(params.userMessage)) {
      return {
        responseText: nome
          ? `Amei, ${nome}! 💛 A Festa na Mesa fica linda e bem prática no pegue e monte. Temos R$100, R$130 e R$160 — qual você prefere?`
          : `Amei! 💛 A Festa na Mesa fica linda no pegue e monte. Temos R$100, R$130 e R$160 — qual combina mais com a sua festa?`,
        festaId: ctx.festaId,
      };
    }
    return {
      responseText: nome
        ? `Oi, ${nome}! Que bom te ver 💛 Me conta com calma o que você precisa?`
        : "Oi! Que bom te ver 💛 Me conta com calma o que você precisa?",
      festaId: ctx.festaId,
    };
  }
}

async function runSalesFunnelInner(
  params: {
    userMessage: string;
    waId: string;
    contactName?: string | null;
    conversaId?: string | null;
    vendedorId?: string | null;
    cliente?: { id: string; nome: string; telefone: string } | null;
    festaId?: string | null;
    posts?: Array<{ caption?: string; permalink?: string }>;
  },
  ctx: FunnelContext,
  opts?: { forceNoTools?: boolean; socialOnly?: boolean }
): Promise<{ responseText: string; festaId?: string | null }> {
  const postsText = summarizeCampaigns(params.posts);

  let catalogText = "";
  if (djDecorClient.isEnabled() && !opts?.socialOnly) {
    try {
      catalogText = catalogSummary(await getCatalog());
    } catch (err: any) {
      console.warn("[funil] catálogo indisponível:", err?.message || err);
    }
  }

  let history: ChatMessage[] = [];
  if (params.conversaId && djDecorClient.isEnabled()) {
    try {
      const data = await djDecorClient.getConversa(params.conversaId);
      const msgs = data?.conversa?.mensagens || [];
      history = msgs.slice(-12).map((m: any) => {
        const texto = String(m.texto || "").slice(0, 500);
        if (m.direcao === "IN") {
          return { role: "user" as const, content: texto || "[mídia]" };
        }
        return { role: "assistant" as const, content: texto };
      });
      history = history.filter((m) => {
        if (m.role !== "assistant") return true;
        const c = m.content || "";
        if (/em que posso te ajudar na festa\?/i.test(c)) return false;
        if (/me conta a data e o clima da festa/i.test(c)) return false;
        if (/pode me contar com calma o que você precisa/i.test(c)) return false;
        return true;
      });
      if (!ctx.vendedorId && data?.conversa?.vendedorId) {
        ctx.vendedorId = data.conversa.vendedorId;
      }
      const festaStatus = data?.conversa?.festa?.status;
      const festaIdCrm = data?.conversa?.festaId;
      if (festaIdCrm && festaStatus !== "CANCELADO") {
        ctx.festaId = festaIdCrm;
      } else {
        ctx.festaId = null;
      }
    } catch (err: any) {
      console.warn("[funil] histórico CRM:", err?.message || err);
    }
  }

  const last = history[history.length - 1];
  if (!last || last.role !== "user" || last.content !== params.userMessage) {
    history.push({ role: "user", content: params.userMessage });
  }

  const socialHint = opts?.socialOnly
    ? "\nModo desta mensagem: abertura social. Acolha e espere — sem vender ainda."
    : "";

  const campaignHint = isCampaignAsk(params.userMessage)
    ? "\nO cliente perguntou de campanha: use os posts abaixo e explique a oferta ativa com carinho."
    : "";

  const contextBlock = [
    `waId/telefone: ${params.waId}`,
    `Nome: ${params.contactName || "—"}`,
    `conversaId: ${params.conversaId || "—"}`,
    `cliente: ${params.cliente ? `${params.cliente.nome} (${params.cliente.telefone})` : "novo"}`,
    `festaId: ${ctx.festaId || "nenhuma"}`,
    catalogText || null,
    postsText
      ? `Campanhas/posts ativos do Instagram (use quando fizer sentido):\n${postsText}`
      : "Nenhum post Instagram carregado agora.",
    socialHint || null,
    campaignHint || null,
  ]
    .filter(Boolean)
    .join("\n");

  const baseMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: `Contexto:\n${contextBlock}` },
    ...history,
  ];

  const models = resolveChatModels();
  console.log(`[funil] modelos na fila: ${models.slice(0, 3).join(", ")}...`);

  // 1) Tools (exceto abertura social)
  if (!opts?.forceNoTools) {
    try {
      const messages = [...baseMessages];
      let replyText = "";
      for (let step = 0; step < 6; step++) {
        const completion = await openRouterChat({
          messages,
          withTools: true,
          models,
        });
        const choice = completion.choices?.[0]?.message;
        if (!choice) break;

        const toolCalls = normalizeToolCalls(choice);
        if (toolCalls.length) {
          messages.push({
            role: "assistant",
            content: choice.content ?? null,
            tool_calls: toolCalls.map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.name, arguments: c.arguments },
            })),
          });
          for (const call of toolCalls) {
            let toolResult: unknown;
            try {
              toolResult = await dispatchTool(call.name, call.arguments, ctx);
            } catch (toolErr: any) {
              toolResult = {
                ok: false,
                error: toolErr?.message || "erro na tool",
              };
            }
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: call.name,
              content: JSON.stringify(toolResult),
            });
          }
          continue;
        }

        replyText = sanitizeReply(String(choice.content ?? ""));
        break;
      }
      if (replyText) return { responseText: replyText, festaId: ctx.festaId };
    } catch (err: any) {
      console.warn("[funil] modo tools falhou:", err?.message || err);
    }
  }

  // 2) Texto puro
  try {
    const completion = await openRouterChat({
      messages: baseMessages,
      withTools: false,
      models,
    });
    const content = sanitizeReply(
      String(completion.choices?.[0]?.message?.content ?? "")
    );
    if (content) return { responseText: content, festaId: ctx.festaId };
  } catch (err: any) {
    console.warn("[funil] modo texto falhou:", err?.message || err);
  }

  if (isCampaignAsk(params.userMessage)) {
    return {
      responseText: campaignFallbackReply(params.posts, params.contactName),
      festaId: ctx.festaId,
    };
  }

  const legacy = sanitizeReply(
    await generateAIResponse(
      params.userMessage,
      "neutral",
      isWeekend(),
      params.posts || [],
      params.contactName || undefined
    )
  );
  if (legacy) return { responseText: legacy, festaId: ctx.festaId };

  throw new Error("Sem resposta útil dos modelos");
}
