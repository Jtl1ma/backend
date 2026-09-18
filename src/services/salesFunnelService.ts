import config, { freeModeles } from "../config";
import {
  djDecorClient,
  type CatalogoAddon,
  type CatalogoKit,
  type CriarOrcamentoInput,
} from "../integrations/djDecorClient";
import { notifyHumanAttendant } from "./attendantService";

const SYSTEM_PROMPT = `Você é a *Debysinha*, amiga atenciosa e vendedora da Débora Pimentel Decoradora (Paracambi - RJ | @debora_pimentel_decoradora).

Tom:
- Sempre amiga, acolhedora e atenta — como alguém que realmente quer ajudar.
- Respostas CURTAS: no máximo 2–4 frases ou ~400 caracteres. WhatsApp, não e-mail.
- Uma pergunta por vez. Sem listas longas, sem markdown pesado, sem vários tópicos de uma vez.
- Emojis com moderação (1–2). Nunca blocos de texto, "ideias 1/2/3" ou manuais.

Objetivo: conduzir o cliente até fechar a decoração no sistema (criar orçamento/venda), igual um vendedor humano.

Regras de venda:
- Sempre use as tools para preços (listar_catalogo / montar_orcamento), agenda (checar_agenda) e criação (criar_venda). Nunca invente preço.
- Campanhas/posts do Instagram são ofertas reais: apresente no chat com preço do catálogo. NÃO mande o cliente para outro WhatsApp se ele já está falando aqui.
- Kits "Festa na Mesa" são tipicamente pegue-e-monte (retirada no depósito em Paracambi).
- Taxa de leva/busca no pegue-e-monte: +R$30 se o cliente pedir que a equipe leve.
- Colete aos poucos: kit → data → horários (padrão 11:00 montagem / 15:00 festa se não souber) → local ou pegue-e-monte → tema → confirmação.
- Telefone: use o WhatsApp do cliente (waId) se ele não informar outro.
- Antes de criar_venda, resuma em 2–3 linhas (kit, data, valor, local) e peça confirmação ("posso fechar pra você?").
- Só chame criar_venda com confirmadoPeloCliente=true após o cliente confirmar.
- Fora de Paracambi: marque foraParacambi=true. Pegue-e-monte só depósito → endereco com "Paracambi".
- Se pedir desconto especial, reclamação ou algo fora do catálogo: use escalar_humano.
`;

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
          taxaEntrega: {
            type: "boolean",
            description: "Montador leva e busca (+R$30) no pegue e monte",
          },
        },
        required: ["kitId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "checar_agenda",
      description: "Consulta festas no dia no CRM e se ainda cabe encaixe.",
      parameters: {
        type: "object",
        properties: {
          dataEvento: {
            type: "string",
            description: "YYYY-MM-DD ou ISO",
          },
          horarioMontagem: {
            type: "string",
            description: "ISO datetime opcional",
          },
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
        "Cria a festa/orçamento no CRM (igual Nova venda), com vendedor e direito a comissão. Só após confirmação do cliente.",
      parameters: {
        type: "object",
        properties: {
          nomeCliente: { type: "string" },
          telefone: { type: "string" },
          tema: { type: "string" },
          dataEvento: {
            type: "string",
            description: "ISO datetime da festa (ex: 2026-09-22T15:00:00-03:00)",
          },
          horarioMontagem: {
            type: "string",
            description: "ISO datetime da montagem (ex: 2026-09-22T11:00:00-03:00)",
          },
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
      description: "Pede intervenção humana (desconto, reclamação, dúvida complexa).",
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
  postsCaption?: string;
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

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toDay(dataEvento: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(dataEvento)) return dataEvento.slice(0, 10);
  const d = new Date(dataEvento);
  if (Number.isNaN(d.getTime())) return dataEvento;
  return d.toLocaleDateString("en-CA", {
    timeZone: process.env.TIMEZONE || "America/Sao_Paulo",
  });
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
          categoria: k.categoria,
          descricao: k.descricaoCurta,
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
        taxa > 0 ? [`Taxa entrega/busca R$ ${taxa.toFixed(2).replace(".", ",")}`] : [];
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
      const agenda = await djDecorClient.checarAgenda(toDay(dataEvento), horario);
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
          error:
            "Peça confirmação explícita do cliente antes de criar a venda no sistema.",
        };
      }
      if (ctx.festaId) {
        return {
          ok: false,
          error: `Já existe festa vinculada (${ctx.festaId}). Não crie outra sem pedir a um humano.`,
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
      if (itensExtras.length === 0 && kit) {
        itensExtras = [...kit.itens];
      }

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
        if (created?.festa?.id) {
          ctx.festaId = created.festa.id;
        }
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

async function chatCompletion(messages: ChatMessage[]): Promise<any> {
  const openRouterUrl =
    config.openrout.openUrl ||
    config.openrout.url ||
    "https://openrouter.ai/api/v1/chat/completions";

  let lastError: Error | null = null;
  for (const model of freeModeles) {
    try {
      const response = await fetch(openRouterUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openrout.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          tools: TOOLS,
          tool_choice: "auto",
          temperature: 0.5,
          max_tokens: 280,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`${model} HTTP ${response.status}: ${body.slice(0, 200)}`);
      }

      const data = await response.json();
      if (!data?.choices?.[0]) {
        throw new Error(`${model} sem choices`);
      }
      console.log(`[funil] modelo ok: ${model}`);
      return data;
    } catch (err: any) {
      lastError = err;
      console.warn(`[funil] falha modelo ${model}:`, err?.message || err);
    }
  }
  throw lastError || new Error("Nenhum modelo respondeu no funil");
}

/**
 * Funil de vendas: histórico do CRM + tools (catálogo, agenda, criar venda).
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

  const postsText = (params.posts || [])
    .slice(0, 5)
    .map(
      (p, i) =>
        `${i + 1}. ${(p.caption || "Post Instagram").slice(0, 280)} — ${p.permalink || ""}`
    )
    .join("\n");

  let history: ChatMessage[] = [];
  if (params.conversaId && djDecorClient.isEnabled()) {
    try {
      const data = await djDecorClient.getConversa(params.conversaId);
      const msgs = data?.conversa?.mensagens || [];
      history = msgs.slice(-20).map((m: any) => {
        if (m.direcao === "IN") {
          return { role: "user" as const, content: m.texto || "[mídia]" };
        }
        return { role: "assistant" as const, content: m.texto || "" };
      });
      if (!ctx.vendedorId && data?.conversa?.vendedorId) {
        ctx.vendedorId = data.conversa.vendedorId;
      }
      if (!ctx.festaId && data?.conversa?.festaId) {
        ctx.festaId = data.conversa.festaId;
      }
    } catch (err: any) {
      console.warn("[funil] não carregou histórico CRM:", err?.message || err);
    }
  }

  // Garante que a mensagem atual está no final (pode já ter sido syncada)
  const last = history[history.length - 1];
  if (!last || last.role !== "user" || last.content !== params.userMessage) {
    history.push({ role: "user", content: params.userMessage });
  }

  const contextBlock = [
    `waId/telefone: ${params.waId}`,
    `Nome contato: ${params.contactName || "—"}`,
    `conversaId: ${params.conversaId || "—"}`,
    `cliente: ${params.cliente ? `${params.cliente.nome} (${params.cliente.telefone})` : "novo"}`,
    `festaId vinculada: ${ctx.festaId || "nenhuma"}`,
    `vendedorId: ${ctx.vendedorId || "padrão Debora no CRM"}`,
    postsText ? `Campanhas/posts ativos do Instagram:\n${postsText}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: `Contexto da conversa:\n${contextBlock}` },
    ...history,
  ];

  if (!djDecorClient.isEnabled()) {
    return {
      responseText:
        "Oi! No momento estou com a agenda do sistema offline. Pode mandar de novo em instantes? 🌷",
    };
  }

  let replyText = "";
  for (let step = 0; step < 8; step++) {
    const completion = await chatCompletion(messages);
    const choice = completion.choices?.[0]?.message;
    if (!choice) break;

    if (choice.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: choice.content ?? null,
        tool_calls: choice.tool_calls,
      });
      for (const call of choice.tool_calls) {
        const toolResult = await dispatchTool(
          call.function.name,
          call.function.arguments,
          ctx
        );
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(toolResult),
        });
      }
      continue;
    }

    replyText = String(choice.content ?? "").trim();
    break;
  }

  if (!replyText) {
    replyText =
      "Oi! Me conta a data da festa e se prefere Festa na Mesa ou outro kit que eu te ajudo ✨";
  }

  // Evita lixo tipo "User Safety: safe"
  if (/^user safety/i.test(replyText) || replyText.toLowerCase() === "safe") {
    replyText =
      "Perfeito! Qual pacote da Festa na Mesa você quer: R$100, R$130 ou R$160? 😊";
  }

  return { responseText: replyText, festaId: ctx.festaId };
}
