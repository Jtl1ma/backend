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

const SYSTEM_PROMPT = `Você é a Debysinha — WhatsApp da Débora Pimentel Decoradora (Paracambi - RJ, @debora_pimentel_decoradora).

Persona: amiga atenciosa, natural, carioca leve. Conversa de verdade — nunca script, nunca lista robótica de preços.

Como ajudar (obrigatório):
- Se a cliente NÃO tem ideia clara / só pergunta "quanto custa" / "o que você tem": ENTENDA primeiro. Em 1 pergunta curta, descubra ocasião (aniversário, chá…), tamanho aproximado (mesa / salão pequeno / grande) ou faixa de orçamento. Só depois sugira.
- NUNCA despeje o catálogo inteiro. No máximo 2 ou 3 opções que façam sentido pro que ela descreveu, com preço.
- Use o bloco Catálogo e as Campanhas/posts do Instagram do contexto pra orientar — campanha VIP/CURIOSA quando bater com Festa na Mesa.
- Se ela já deu sinal (ex.: festa na mesa, 6M, festa): responda direto com 1–2 opções alinhadas, sem interrogatório longo.
- Esta NÃO é a primeira mensagem se já houver histórico. Nunca diga "Que bom te ver" nem peça de novo o que ela JÁ falou.
- Cumprimento / "posso falar?": acolha e espere. Sem vender ainda.
- "130" / "de 130" na Festa na Mesa = R$130 (festa-mesa-com-mesa), NÃO é arco de 130cm.
- Festa na Mesa: R$100 / R$130 / R$160 (pegue e monte; leva/busca +R$30).
- Quer mudar kit ou festa maior: confirme a troca e sugira 2 opções — não ignore e não force fechar a venda antiga.
- Dados completos: resuma e peça OK pra registrar (criar_venda). Observações/notas com todos os detalhes.
- 2–5 frases. Emojis 0–2. Tom humano.

Tools: listar_catalogo / montar_orcamento / checar_agenda / criar_venda (só com confirmação). Não invente preço. Reclamação/desconto especial → escalar_humano.
`;

const BAD_OPENER =
  /que bom te ver|em que posso te ajudar na festa|pode me contar com calma o que voc[eê] precisa|tudo bem\? claro que quero te ajudar/i;

type SaleSlots = {
  kitCatalogo: string | null;
  valor: number | null;
  tema: string | null;
  dataISO: string | null; // YYYY-MM-DD
  horaMontagem: string | null; // HH:mm
  horaFesta: string | null;
  endereco: string | null;
  pegueEMonte: boolean;
  foraParacambi: boolean;
  confirmou: boolean;
};

type KitBand = "mesa" | "pequeno" | "medio" | "grande" | null;

function isCampaignAsk(text: string): boolean {
  return /\b(campanha|promo|promo[cç][aã]o|desconto|vip|curios[oa]|instagram|stories?)\b/i.test(
    text
  );
}

function isCatalogAsk(text: string): boolean {
  return /\b(cat[aá]logo|quais?\s+(vc|voc[eê])\s+tem|o\s+que\s+(vc|voc[eê])\s+tem|mostrar?\s+(os\s+)?(kits|op[cç][oõ]es|pacotes)|op[cç][oõ]es\s+de\s+(festa|decor)|lista\s+de\s+(kits|pre[cç]os)|card[aá]pio)\b/i.test(
    text
  );
}

function wantsKitChange(text: string): boolean {
  return /\b(mudar|trocar|outra\s+festa|festa\s+maior|festa\s+grande|maior|menor|mais\s+pequena|um\s+pouco\s+menor|n[aã]o\s+muito\s+grande|n[aã]o\s+t[aã]o\s+grande|6\s*m|6\s*metros|4\s*m|4\s*metros|decora[cç][aã]o\s+\d|kit\s+(pocket|m[eé]dia|intermedi|grande))\b/i.test(
    text
  );
}

/** Cliente explorando tamanho/opções — não é confirmação de fechamento. */
function isExploringOptions(text: string): boolean {
  return (
    isCatalogAsk(text) ||
    wantsKitChange(text) ||
    isVaguePriceAsk(text) ||
    isUndecided(text) ||
    /\b(tem\s+(uma\s+)?festa|tem\s+alguma|o\s+que\s+voc[eê]\s+tem|me\s+mostra|op[cç][oõ]es|outra\s+op[cç][aã]o|mais\s+simples|compact[oa]|intimista|n[aã]o\s+muito\s+grande|um\s+pouco\s+menor)\b/i.test(
      text
    )
  );
}

/** Pergunta de valor/preço sem citar tipo de festa. */
function isVaguePriceAsk(text: string): boolean {
  const asksPrice =
    /\b(quanto custa|qual\s+(o\s+)?valor|quais?\s+(os\s+)?valores|quais?\s+(os\s+)?pre[cç]os|me passa\s+(o\s+)?valor|faixa\s+de\s+pre[cç]o|t[aá]\s+quanto)\b/i.test(
      text
    );
  if (!asksPrice) return false;
  return !/\b(festa na mesa|6\s*m|4\s*m|pocket|intermedi|m[eé]dia|130|100|160|mesa|metros)\b/i.test(
    text
  );
}

function isUndecided(text: string): boolean {
  return /\b(n[aã]o sei|sem ideia|n[aã]o tenho ideia|me ajuda a (escolher|decidir)|o que (voc[eê]|vc) (sugere|indica|recomenda)|estou em d[uú]vida|ainda n[aã]o sei|n[aã]o sei qual)\b/i.test(
    text
  );
}

function lastClientMessages(transcript: string, n = 2): string {
  const lines = transcript
    .split("\n")
    .filter((l) => /^IN:/i.test(l))
    .map((l) => l.replace(/^IN:\s*/i, "").trim())
    .filter(Boolean);
  if (!lines.length) return transcript.trim();
  return lines.slice(-Math.max(1, n)).join("\n");
}

function inferKitBand(text: string): KitBand {
  if (
    /\b(n[aã]o\s+muito\s+grande|n[aã]o\s+t[aã]o\s+grande|um\s+pouco\s+menor|mais\s+menor|menor|mais\s+pequena|compact[oa])\b/i.test(
      text
    )
  ) {
    return "medio";
  }
  if (/\b(6\s*m|6\s*metros|4\s*m|4\s*metros|festa\s+grande|sal[aã]o\s+grande|decora[cç][aã]o\s+grande)\b/i.test(text)) {
    return "grande";
  }
  if (/\b(festa na mesa|mesa|pegue\s*e\s*monte|simples|baratinh)\b/i.test(text)) {
    return "mesa";
  }
  if (/\b(pocket|pequena|intimista|em casa|apartamento)\b/i.test(text)) {
    return "pequeno";
  }
  if (/\b(intermedi|m[eé]dia|m[eé]dio|sal[aã]o\s+pequeno)\b/i.test(text)) {
    return "medio";
  }
  return null;
}

function pickKitsForBand(
  cat: { kits: CatalogoKit[] },
  band: KitBand
): CatalogoKit[] {
  const byId = (id: string) => cat.kits.find((k) => k.id === id);
  const pick = (ids: string[]) =>
    ids.map(byId).filter(Boolean) as CatalogoKit[];

  if (band === "mesa") {
    return pick(["festa-mesa", "festa-mesa-com-mesa", "festa-mesa-mesa-bolas"]);
  }
  if (band === "pequeno") {
    return pick(["pocket", "festa-mesa-com-mesa", "intermediaria"]);
  }
  if (band === "medio") {
    return pick(["intermediaria", "media", "decoracao-4m"]);
  }
  if (band === "grande") {
    return pick(["decoracao-6m", "decoracao-4m", "media"]);
  }
  // Sem sinal: 3 caminhos populares (não o catálogo todo)
  return pick(["festa-mesa-com-mesa", "media", "decoracao-6m"]);
}

function formatKitLine(k: CatalogoKit): string {
  const pe =
    k.valorPegueEMonte != null && k.valorPegueEMonte !== k.valorEquipe
      ? ` · pegue e monte R$${k.valorPegueEMonte}`
      : k.valorPegueEMonte != null
        ? " · pegue e monte"
        : "";
  return `• *${k.nome}* — R$${k.valorEquipe}${pe}`;
}

/**
 * Resposta humana: poucas opções alinhadas ao pedido, ou pergunta pra entender.
 */
function humanAssistReply(params: {
  cat: { kits: CatalogoKit[]; addons: CatalogoAddon[] };
  userMessage: string;
  contactName?: string | null;
  posts?: Array<{ caption?: string; permalink?: string }>;
  changing?: boolean;
}): string {
  const { cat, userMessage, contactName, posts, changing } = params;
  const nome = contactName?.split(/\s+/)[0];
  const prefix = nome ? `${nome}, ` : "";
  const band = inferKitBand(userMessage);
  const joinedPosts = (posts || []).map((p) => p.caption || "").join(" ");
  const hasVip = /festa na mesa|curios|vip/i.test(joinedPosts);
  const link = posts?.find((p) => p.permalink)?.permalink;

  // Pedido com faixa de tamanho → 2–3 opções, sem dump
  if (band === "grande" || band === "mesa" || band === "pequeno" || band === "medio") {
    const kits = pickKitsForBand(cat, band).slice(0, 3);
    let intro: string;
    if (band === "medio") {
      intro = changing
        ? "entendi, algo mais contido — essas costumam ficar ótimas:"
        : "pra festa não muito grande, essas costumam ficar ótimas:";
    } else if (band === "grande") {
      intro = changing
        ? "fechado, vamos pra algo maior — essas costumam ficar lindas:"
        : "pra festa grande eu indico essas:";
    } else if (band === "mesa") {
      intro = hasVip
        ? `pra mesa fica lindo — e ainda rola a campanha VIP` +
          (link ? ` (${link})` : "") +
          ` com a palavra *CURIOSA*. Opções:`
        : "pra Festa na Mesa (pegue e monte) tenho essas:";
    } else {
      intro = "olha o que mais combina com o que você falou:";
    }
    return (
      prefix + intro + "\n" + kits.map(formatKitLine).join("\n") + "\nQual te anima mais?"
    );
  }

  // Valor / catálogo / indecisão sem tipo → entender primeiro (+ 1 dica leve)
  if (
    isVaguePriceAsk(userMessage) ||
    isUndecided(userMessage) ||
    isCatalogAsk(userMessage)
  ) {
    const campanha =
      hasVip
        ? ` Se quiser algo prático, a *Festa na Mesa* tá em campanha VIP no Instagram` +
          (link ? ` (${link})` : "") +
          "."
        : "";
    return (
      prefix +
      `me conta um pouquinho pra eu te indicar certo: é aniversário, chá, outro? E você imagina algo mais de *mesa* (compacto) ou um *painel/salão* maior?` +
      campanha +
      ` Assim eu te passo só 2–3 opções com valor, sem enrolação 💛`
    );
  }

  // Mudança genérica
  if (changing) {
    return (
      prefix +
      "sem problema, a gente ajusta! Você tá pensando em algo mais *compacto* (mesa) ou *maior* (painel/metros)? Me fala o clima que eu te indico 2 opções com preço."
    );
  }

  const popular = pickKitsForBand(cat, null).slice(0, 3);
  return (
    prefix +
    "pra eu te ajudar bem, me fala se quer algo de mesa ou uma decoração maior — enquanto isso, as mais pedidas são:\n" +
    popular.map(formatKitLine).join("\n") +
    "\nQual caminho te chama?"
  );
}

/** Só falas do cliente (linhas IN:) — evita puxar lixo das perguntas da IA. */
function clientOnlyText(transcript: string): string {
  const lines = transcript
    .split("\n")
    .filter((l) => /^IN:/i.test(l))
    .map((l) => l.replace(/^IN:\s*/i, "").trim())
    .filter(Boolean);
  return lines.length ? lines.join("\n") : transcript;
}

function isSoftOpener(text: string): boolean {
  const t = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
  if (!t || t.length > 90) return false;
  if (isCampaignAsk(t)) return false;
  const hasSaleIntent =
    /(festa|decor|mesa|orcamento|orçamento|agendar|kit|preco|preço|pacote|valor|contrato|bolas|casamento|anivers|130|100|160|rua|endereco|endereço|cat[aá]logo|6\s*m|4\s*m|metros|quanto custa)/i.test(
      t
    );
  if (hasSaleIntent) return false;
  return (
    /^(oi|ola|olá|oie|eai|e ai|bom dia|boa tarde|boa noite)\b/.test(t) ||
    /\b(posso falar|pode falar|tem um minutinho|um minuto|tudo bem|td bem|como vai|ta ocupada|tá ocupada|ocupada\?)\b/.test(
      t
    )
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
  contactName?: string | null,
  slots?: SaleSlots
): string {
  const nome = contactName?.split(/\s+/)[0];
  const joined = (posts || []).map((p) => p.caption || "").join(" \n ");
  const hasVip = /festa na mesa|curios|vip/i.test(joined);
  const link = posts?.find((p) => p.permalink)?.permalink;
  const missing = missingSlotQuestion(slots);

  if (hasVip) {
    return (
      (nome ? `${nome}, ` : "") +
      `sim — campanha VIP da *Festa na Mesa* no Instagram` +
      (link ? ` (${link})` : "") +
      `. Pacotes R$100, R$130 e R$160 (pegue e monte) e a brincadeira do post é *CURIOSA*. ` +
      (missing || "Quer que eu já registre o seu pacote no sistema?")
    );
  }
  return (
    (nome ? `${nome}, ` : "") +
    (missing ||
      "Temos a Festa na Mesa (R$100 / R$130 / R$160). Qual pacote você quer?")
  );
}

/** Extrai dados de venda do texto completo da conversa. */
export function extractSaleSlots(transcript: string): SaleSlots {
  // Preferências do cliente — não misturar com perguntas da IA
  const client = clientOnlyText(transcript);
  const t = client || transcript;
  // Kit/tamanho: só últimas falas (evita travar em "6M" antigo)
  const recentKitText = lastClientMessages(transcript, 2);
  const lastMsg = lastClientMessages(transcript, 1);

  let kitCatalogo: string | null = null;
  let valor: number | null = null;
  let pegueEMonte = /pegue\s*e\s*monte|pegue e monte|retirada|dep[oó]sito/i.test(
    recentKitText
  );

  // Se está explorando tamanho ("menor", "não muito grande"), NÃO herda kit antigo
  const exploring = isExploringOptions(lastMsg);

  if (!exploring || inferKitBand(lastMsg) === "grande") {
    if (/\b(6\s*m|6\s*metros|decora[cç][aã]o\s*6|festa\s+grande\s+de\s*6)\b/i.test(recentKitText)) {
      kitCatalogo = "decoracao-6m";
      valor = 980;
      pegueEMonte = false;
    } else if (/\b(4\s*m|4\s*metros|decora[cç][aã]o\s*4)\b/i.test(recentKitText)) {
      kitCatalogo = "decoracao-4m";
      valor = 730;
      pegueEMonte = false;
    }
  }

  if (!kitCatalogo) {
    if (/\bkit\s*festa\s*m[eé]dia|festa\s+m[eé]dia\b/i.test(recentKitText) && !exploring) {
      kitCatalogo = "media";
      valor = 450;
    } else if (/\bintermedi[aá]ria\b/i.test(recentKitText) && !exploring) {
      kitCatalogo = "intermediaria";
      valor = 350;
    } else if (/\bpocket\b/i.test(recentKitText) && !exploring) {
      kitCatalogo = "pocket";
      valor = 250;
    }
  }

  const priceHits = [
    ...recentKitText.matchAll(
      /(?:r\$\s*)?(100|130|160)(?:\s*reais)?|quero a de\s*(100|130|160)|pacote\s*(?:de\s*)?(100|130|160)/gi
    ),
  ];
  // Só aplica Festa na Mesa se não pediu kit maior e não está só explorando
  if (!kitCatalogo && priceHits.length && !exploring) {
    const last = priceHits[priceHits.length - 1];
    const n = Number(last[1] || last[2] || last[3]);
    if (n === 100) {
      kitCatalogo = "festa-mesa";
      valor = 100;
      pegueEMonte = true;
    } else if (n === 130) {
      kitCatalogo = "festa-mesa-com-mesa";
      valor = 130;
      pegueEMonte = true;
    } else if (n === 160) {
      kitCatalogo = "festa-mesa-mesa-bolas";
      valor = 160;
      pegueEMonte = true;
    }
  } else if (!kitCatalogo && /festa na mesa/i.test(recentKitText)) {
    pegueEMonte = true;
  }

  // Explorando "menor / não muito grande" → limpa kit grande herdado
  if (exploring && (inferKitBand(lastMsg) === "medio" || inferKitBand(lastMsg) === "pequeno" || inferKitBand(lastMsg) === "mesa")) {
    if (kitCatalogo === "decoracao-6m" || kitCatalogo === "decoracao-4m") {
      kitCatalogo = null;
      valor = null;
    }
  }
  if (exploring && !/\b(100|130|160|pocket|intermedi|m[eé]dia|6\s*m|4\s*m|festa-mesa)\b/i.test(lastMsg)) {
    // Ainda escolhendo — não trava kit
    kitCatalogo = null;
    valor = null;
  }

  let dataISO: string | null = null;
  const br = [...t.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)];
  if (br.length) {
    const m = br[br.length - 1];
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    let year = m[3];
    if (!year) year = "2026";
    else if (year.length === 2) year = `20${year}`;
    dataISO = `${year}-${month}-${day}`;
  }

  let horaMontagem: string | null = null;
  let horaFesta: string | null = null;
  const horaMatches = [
    ...t.matchAll(
      /(?:montar|montagem|as|às)\s*(\d{1,2})(?::(\d{2}))?\s*h?|\b(\d{1,2}):(\d{2})\b/gi
    ),
  ];
  if (horaMatches.length) {
    const last = horaMatches[horaMatches.length - 1];
    const hh = (last[1] || last[3] || "18").padStart(2, "0");
    const mm = (last[2] || last[4] || "00").padStart(2, "0");
    horaMontagem = `${hh}:${mm}`;
    horaFesta = horaMontagem;
  }

  let endereco: string | null = null;
  const rua = t.match(
    /\b(rua\s+[A-Za-zÀ-ÿ0-9][^.\n?]{5,100}(?:,\s*\d+)?[^.\n?]{0,40})/i
  );
  if (rua) {
    endereco = rua[1]
      .replace(/\s+/g, " ")
      .replace(/\s*(pra eu|pra gente|pode|assim).*$/i, "")
      .trim();
    if (/rua e n[uú]mero|endere[cç]o completo/i.test(endereco)) {
      endereco = null;
    }
  }
  if (!endereco && /espa[cç]o\s+de\s+festa\s+campos/i.test(t) && /beraldo|sabugo/i.test(t)) {
    endereco = "Rua Beraldo Sacchi, 528, Sabugo — Espaço de festa Campos";
  } else if (!endereco && /espa[cç]o\s+de\s+festa\s+campos/i.test(t)) {
    endereco = "Espaço de festa Campos";
  }

  let tema: string | null = null;
  const temaM = t.match(
    /tema\s+(?:[ée]\s+|eu quero(?:\s+que seja)?\s+|seja\s+)?([^\n.?!]{3,80})/i
  );
  if (temaM) {
    const cand = temaM[1].trim();
    if (
      !/^(da festa|da decora|qual|o qu|eu quero|voc[eê])/i.test(cand) &&
      cand.length >= 3
    ) {
      tema = cand;
    }
  }
  if (!tema && /happy\s*birthday/i.test(t)) {
    tema = /led/i.test(t) ? "Happy Birthday com LED" : "Happy Birthday";
  } else if (!tema && /preto e dourado/i.test(t)) {
    tema = "Happy Birthday preto e dourado";
  }

  if (/festa na mesa/i.test(t) && kitCatalogo?.startsWith("festa-mesa")) {
    pegueEMonte = true;
  }

  const foraParacambi =
    Boolean(endereco) && !/paracambi/i.test(endereco || "");

  const confirmou =
    /\b(sim|pode fechar|pode registrar|fechado|confirmo|pode criar|quero essa|pode ser)\b/i.test(
      lastMsg
    ) &&
    !isExploringOptions(lastMsg) &&
    !wantsKitChange(lastMsg) &&
    !isCatalogAsk(lastMsg);

  return {
    kitCatalogo,
    valor,
    tema,
    dataISO,
    horaMontagem,
    horaFesta,
    endereco,
    pegueEMonte,
    foraParacambi,
    confirmou,
  };
}

function slotsMissing(s: SaleSlots): string[] {
  const miss: string[] = [];
  if (!s.kitCatalogo || !s.valor) {
    miss.push("pacote / tamanho da decoração");
  }
  if (!s.dataISO) miss.push("data da festa");
  if (!s.horaMontagem) miss.push("horário de montagem");
  if (!s.endereco) miss.push("endereço / local");
  if (!s.tema) miss.push("tema");
  return miss;
}

function slotsComplete(s: SaleSlots): boolean {
  return slotsMissing(s).length === 0;
}

function missingSlotQuestion(s?: SaleSlots | null): string | null {
  if (!s) return null;
  const miss = slotsMissing(s);
  if (!miss.length) {
    return "Posso registrar no sistema agora pra você?";
  }
  if (miss.length === 1) return `Só me falta: ${miss[0]}. Pode me passar?`;
  return `Pra fechar, ainda preciso de: ${miss.slice(0, 3).join(", ")}.`;
}

function formatSlotsBlock(s: SaleSlots): string {
  return [
    `kit=${s.kitCatalogo || "—"}`,
    `valor=${s.valor ?? "—"}`,
    `tema=${s.tema || "—"}`,
    `data=${s.dataISO || "—"}`,
    `montagem=${s.horaMontagem || "—"}`,
    `endereco=${s.endereco || "—"}`,
    `pegueEMonte=${s.pegueEMonte}`,
    `foraParacambi=${s.foraParacambi}`,
  ].join(" | ");
}

function toIsoDateTime(dateISO: string, hm: string): string {
  const [h, m] = hm.split(":");
  return `${dateISO}T${h.padStart(2, "0")}:${(m || "00").padStart(2, "0")}:00-03:00`;
}

function buildObservacoesCompletas(params: {
  slots: SaleSlots;
  contactName?: string | null;
  waId: string;
  posts?: Array<{ caption?: string; permalink?: string }>;
  transcript?: string;
}): { observacoes: string; notasInternas: string } {
  const { slots, contactName, waId, posts, transcript } = params;
  const dataBr = slots.dataISO
    ? slots.dataISO.split("-").reverse().join("/")
    : "—";
  const campanha =
    posts?.some((p) => /festa na mesa|curios|vip/i.test(p.caption || "")) ||
    /curios|campanha vip|vip/i.test(transcript || "");
  const link = posts?.find((p) => p.permalink)?.permalink;

  const observacoes = [
    "Venda via WhatsApp (Debysinha)",
    `Cliente: ${contactName || "—"} · Tel: ${waId}`,
    `Pacote: ${slots.kitCatalogo || "—"} · R$ ${slots.valor ?? "—"}`,
    `Tema: ${slots.tema || "—"}`,
    `Data: ${dataBr} · Montagem: ${slots.horaMontagem || "—"}`,
    `Local: ${slots.endereco || "—"}`,
    slots.pegueEMonte
      ? "Modalidade: Pegue e monte (retirada/devolução no depósito)"
      : "Modalidade: Montagem pela equipe",
    slots.foraParacambi ? "Fora de Paracambi: sim" : "Fora de Paracambi: não",
    campanha
      ? `Campanha VIP Festa na Mesa${link ? ` · ${link}` : ""} · palavra CURIOSA`
      : null,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1900);

  const trechosCliente = (transcript || "")
    .split("\n")
    .filter((l) => /^IN:/i.test(l))
    .map((l) => l.replace(/^IN:\s*/i, "").trim())
    .filter(Boolean)
    .slice(-8);

  const notasInternas = [
    "Notas da conversa (IA):",
    slots.tema ? `· Tema/detalhe: ${slots.tema}` : null,
    campanha ? "· Entrou por campanha VIP / CURIOSA" : null,
    trechosCliente.length
      ? `· Pedidos do cliente:\n${trechosCliente.map((t) => `  - ${t}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3900);

  return { observacoes, notasInternas };
}

async function tryCreateSaleFromSlots(
  ctx: FunnelContext,
  slots: SaleSlots,
  opts?: {
    contactName?: string | null;
    posts?: Array<{ caption?: string; permalink?: string }>;
    transcript?: string;
    fechar?: boolean;
  }
): Promise<{ ok: boolean; festaId?: string; status?: string; error?: string }> {
  if (!slotsComplete(slots) || !slots.kitCatalogo || !slots.valor || !slots.dataISO) {
    return { ok: false, error: "slots incompletos" };
  }
  if (ctx.festaId) return { ok: false, error: "já existe festa" };

  const cat = await getCatalog();
  const kit = cat.kits.find((k) => k.id === slots.kitCatalogo);
  const horaM = slots.horaMontagem || "11:00";
  const horaF = slots.horaFesta || slots.horaMontagem || "15:00";
  const { observacoes, notasInternas } = buildObservacoesCompletas({
    slots,
    contactName: opts?.contactName,
    waId: ctx.waId,
    posts: opts?.posts,
    transcript: opts?.transcript,
  });

  const payload: CriarOrcamentoInput = {
    nomeCliente: String(
      ctx.cliente?.nome || opts?.contactName || "Cliente WhatsApp"
    ),
    telefone: String(ctx.cliente?.telefone || ctx.waId),
    tema: slots.tema || "Festa na Mesa",
    dataEvento: toIsoDateTime(slots.dataISO, horaF),
    horarioMontagem: toIsoDateTime(slots.dataISO, horaM),
    endereco:
      slots.endereco ||
      "Depósito Débora Pimentel — Paracambi/RJ (pegue e monte)",
    valor: slots.valor,
    tamanhoDecoracao: (kit?.tamanhoSugerido || "P") as "P" | "M" | "G" | "GG",
    kitCatalogo: slots.kitCatalogo,
    pegueEMonte: slots.pegueEMonte,
    itensExtras: kit?.itens ? [...kit.itens] : [],
    observacoes,
    notasInternas,
    foraParacambi: slots.foraParacambi,
    origem: "WhatsApp",
    conversaId: ctx.conversaId || undefined,
    vendedorId: ctx.vendedorId || undefined,
    fechar: opts?.fechar !== false,
  };

  try {
    const created = await djDecorClient.criarOrcamento(payload);
    const id = created?.festa?.id;
    if (id) ctx.festaId = id;
    return {
      ok: true,
      festaId: id,
      status: created?.festa?.status,
    };
  } catch (err: any) {
    return {
      ok: false,
      error:
        typeof err?.response?.data === "object"
          ? JSON.stringify(err.response.data)
          : err?.message || "falha criar",
    };
  }
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
      description: "Calcula total do kit.",
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
        "Cria orçamento/festa no CRM. Use quando kit, data, horário, local e tema estiverem ok e a cliente confirmou.",
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
  return `Catálogo (preços oficiais):\n${kits}\nLembre: 100/130/160 = REAIS do pacote Festa na Mesa, nunca centímetros.`;
}

/** Resposta WhatsApp legível com poucas opções (não lista o catálogo inteiro). */
function catalogWhatsAppReply(
  cat: { kits: CatalogoKit[]; addons: CatalogoAddon[] },
  contactName?: string | null,
  hint?: string | null,
  band: KitBand = null
): string {
  const nome = contactName?.split(/\s+/)[0];
  const kits = pickKitsForBand(cat, band).slice(0, 3);
  return (
    (nome ? `${nome}, ` : "") +
    (hint || "olha 3 caminhos que costumam combinar:") +
    "\n" +
    kits.map(formatKitLine).join("\n") +
    "\nQual te anima mais?"
  );
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
        call?.function?.name || call?.name || call?.function_name || "";
      const args = call?.function?.arguments ?? call?.arguments ?? "{}";
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

function choiceText(choice: any): string {
  const c = choice?.content;
  if (typeof c === "string") return c.trim();
  if (Array.isArray(c)) {
    return c
      .map((p) => (typeof p === "string" ? p : p?.text || ""))
      .join("")
      .trim();
  }
  return String(choice?.reasoning || "").trim();
}

function sanitizeReply(text: string): string {
  let t = String(text || "").trim();
  if (!t) return "";
  if (/^user safety/i.test(t) || t.toLowerCase() === "safe") return "";
  if (BAD_OPENER.test(t)) return "";
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
      return {
        ok: true,
        kitId: kit.id,
        kit: kit.nome,
        tamanhoSugerido: kit.tamanhoSugerido,
        valorBase: base,
        valorAddons,
        valorTaxa: taxa,
        total: base + valorAddons + taxa,
        itens: [
          ...kit.itens,
          ...addons.map((a) => a.nome),
          ...(taxa
            ? [`Taxa entrega/busca R$ ${taxa.toFixed(2).replace(".", ",")}`]
            : []),
        ],
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
      return djDecorClient.findByTelefone(String(args.telefone || ctx.waId));
    }

    case "criar_venda": {
      if (!args.confirmadoPeloCliente) {
        return {
          ok: false,
          error: "Peça confirmação explícita antes de criar a venda.",
        };
      }
      if (ctx.festaId) {
        return { ok: false, error: `Já existe festa (${ctx.festaId}).` };
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

      const toolSlots: SaleSlots = {
        kitCatalogo: kitId,
        valor: Number(args.valor),
        tema: String(args.tema),
        dataISO: String(args.dataEvento).slice(0, 10),
        horaMontagem: String(args.horarioMontagem).match(/T(\d{2}:\d{2})/)?.[1] || null,
        horaFesta: null,
        endereco,
        pegueEMonte,
        foraParacambi,
        confirmou: true,
      };
      const enriched = buildObservacoesCompletas({
        slots: toolSlots,
        contactName: String(args.nomeCliente || ctx.contactName || ""),
        waId: ctx.waId,
      });
      const observacoes =
        (args.observacoes ? String(args.observacoes).trim() : "") ||
        enriched.observacoes;
      const notasInternas =
        (args.notasInternas ? String(args.notasInternas).trim() : "") ||
        enriched.notasInternas;

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
        observacoes,
        notasInternas,
        foraParacambi,
        origem: "WhatsApp",
        conversaId: ctx.conversaId || undefined,
        vendedorId: ctx.vendedorId || undefined,
        fechar: true,
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
        temperature: 0.75,
        max_tokens: 550,
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

function contextualFallback(
  slots: SaleSlots,
  userMessage: string,
  contactName?: string | null,
  posts?: Array<{ caption?: string; permalink?: string }>
): string {
  const nome = contactName?.split(/\s+/)[0];
  const prefix = nome ? `${nome}, ` : "";

  if (isCampaignAsk(userMessage)) {
    return campaignFallbackReply(posts, contactName, slots);
  }

  if (
    isVaguePriceAsk(userMessage) ||
    isUndecided(userMessage) ||
    isCatalogAsk(userMessage) ||
    wantsKitChange(userMessage)
  ) {
    const band = inferKitBand(userMessage);
    if (band) {
      // Sem catálogo em mãos no fallback puro — fala faixa aproximada
      if (band === "grande") {
        return (
          prefix +
          "pra festa grande a Decoração 6M fica R$980 e a 4M R$730 (montagem pela equipe). Quer que eu te explique a diferença ou já partimos pra data?"
        );
      }
      if (band === "mesa") {
        return (
          prefix +
          "Festa na Mesa no pegue e monte: R$100, R$130 ou R$160. Qual clima você quer — mais simples ou mais cheinha?"
        );
      }
    }
    return (
      prefix +
      "me conta rapidinho: é aniversário ou outro tipo de festa? E você imagina algo de *mesa* ou um *painel/salão* maior? Aí eu te passo só 2–3 opções com valor 💛"
    );
  }

  if (slotsComplete(slots) && !isExploringOptions(userMessage)) {
    const kitLabel = slots.kitCatalogo?.startsWith("festa-mesa")
      ? `pacote R$${slots.valor}`
      : `${slots.kitCatalogo} R$${slots.valor}`;
    return (
      prefix +
      `anotei: ${slots.tema} · ${slots.dataISO?.split("-").reverse().join("/")} às ${slots.horaMontagem} · ${slots.endereco} · ${kitLabel}. Posso registrar no sistema agora?`
    );
  }

  const q = missingSlotQuestion(slots);
  if (slots.kitCatalogo || /festa na mesa|decora|6\s*m|4\s*m/i.test(userMessage)) {
    return prefix + (q || "Me passa o que ainda falta pra eu fechar pra você?");
  }

  if (isSoftOpener(userMessage)) {
    return prefix + "pode falar, tô aqui 💛";
  }

  return prefix + (q || "me conta o que você precisa que eu te ajudo?");
}

/**
 * Funil de vendas: histórico + slots + GPT-5 + fechamento automático.
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

  try {
    return await runSalesFunnelInner(params, ctx, {
      forceNoTools: isSoftOpener(params.userMessage),
      socialOnly: isSoftOpener(params.userMessage),
    });
  } catch (err: any) {
    console.error("[funil] erro fatal:", err?.message || err);

    // Tenta montar slots só com a mensagem atual + posts
    const slots = extractSaleSlots(params.userMessage);
    if (isCampaignAsk(params.userMessage)) {
      return {
        responseText: campaignFallbackReply(
          params.posts,
          params.contactName,
          slots
        ),
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
    } catch {
      /* ignore */
    }
    return {
      responseText: contextualFallback(
        slots,
        params.userMessage,
        params.contactName,
        params.posts
      ),
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
      console.warn("[funil] catálogo:", err?.message || err);
    }
  }

  let history: ChatMessage[] = [];
  let transcript = "";

  if (params.conversaId && djDecorClient.isEnabled()) {
    try {
      const data = await djDecorClient.getConversa(params.conversaId);
      const msgs = data?.conversa?.mensagens || [];
      history = msgs.slice(-30).map((m: any) => {
        const texto = String(m.texto || "").slice(0, 600);
        if (m.direcao === "IN") {
          return { role: "user" as const, content: texto || "[mídia]" };
        }
        return { role: "assistant" as const, content: texto };
      });
      // Remove só openers ruins da IA — mantém tudo do cliente
      history = history.filter((m) => {
        if (m.role !== "assistant") return true;
        return !BAD_OPENER.test(m.content || "");
      });
      transcript = msgs
        .map((m: any) => `${m.direcao}: ${m.texto || ""}`)
        .join("\n");

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

  transcript = `${transcript}\nIN: ${params.userMessage}`;
  const slots = extractSaleSlots(transcript);
  console.log("[funil] slots:", formatSlotsBlock(slots));

  // Orientação humana: catálogo / valor vago / troca / tamanho — NÃO despejar lista nem fechar venda antiga
  if (isExploringOptions(params.userMessage) && djDecorClient.isEnabled()) {
    try {
      const cat = await getCatalog();
      return {
        responseText: humanAssistReply({
          cat,
          userMessage: params.userMessage,
          contactName: params.contactName,
          posts: params.posts,
          changing: Boolean(
            wantsKitChange(params.userMessage) ||
              /\b(menor|n[aã]o\s+muito\s+grande)\b/i.test(params.userMessage)
          ),
        }),
        festaId: ctx.festaId,
      };
    } catch (err: any) {
      console.warn("[funil] assistência de catálogo falhou:", err?.message || err);
    }
  }

  // Auto-fecha quando dados completos e cliente acabou de confirmar / completar
  const justCompleted =
    slotsComplete(slots) &&
    !ctx.festaId &&
    !isExploringOptions(params.userMessage) &&
    (slots.confirmou ||
      /tema|data|rua|montar|endere[cç]o|happy birthday|led|130|100|160/i.test(
        params.userMessage
      ));

  if (justCompleted && djDecorClient.isEnabled()) {
    const created = await tryCreateSaleFromSlots(ctx, slots, {
      contactName: params.contactName,
      posts: params.posts,
      transcript,
      fechar: true,
    });
    if (created.ok) {
      const dataBr = slots.dataISO!.split("-").reverse().join("/");
      const nome = params.contactName?.split(/\s+/)[0] || "";
      const statusLabel =
        created.status === "FECHADO" ? "fechei" : "registrei";
      return {
        responseText:
          `${nome ? nome + ", " : ""}${statusLabel} pra você no sistema 💛\n` +
          `*${slots.tema}* · ${dataBr} · montagem ${slots.horaMontagem} · ${slots.endereco}\n` +
          `Pacote Festa na Mesa R$${slots.valor}` +
          (slots.pegueEMonte ? " (pegue e monte)" : "") +
          `. Qualquer ajuste é só falar!`,
        festaId: created.festaId,
      };
    }
    console.warn("[funil] auto-close falhou:", created.error);
  }

  const last = history[history.length - 1];
  if (!last || last.role !== "user" || last.content !== params.userMessage) {
    history.push({ role: "user", content: params.userMessage });
  }

  const miss = slotsMissing(slots);
  const contextBlock = [
    `waId/telefone: ${params.waId}`,
    `Nome: ${params.contactName || "—"}`,
    `conversaId: ${params.conversaId || "—"}`,
    `cliente: ${params.cliente ? `${params.cliente.nome} (${params.cliente.telefone})` : "em andamento"}`,
    `festaId: ${ctx.festaId || "nenhuma"}`,
    `Dados já coletados: ${formatSlotsBlock(slots)}`,
    miss.length
      ? `Ainda falta: ${miss.join(", ")}. Pergunte SÓ o que falta.`
      : ctx.festaId
        ? "Já existe festa no CRM — se a cliente quiser mudar, mostre catálogo e confirme a troca."
        : "Tudo completo — confirme e use criar_venda (confirmadoPeloCliente=true).",
    catalogText || null,
    postsText
      ? `Campanhas/posts Instagram:\n${postsText}`
      : null,
    opts?.socialOnly
      ? "Abertura social: acolha e espere, sem vender."
      : null,
    isCampaignAsk(params.userMessage)
      ? "Perguntou de campanha: explique a VIP com os posts e continue o fechamento."
      : null,
    isVaguePriceAsk(params.userMessage) || isUndecided(params.userMessage)
      ? "Cliente sem ideia clara / só pediu valor: ENTENDA (ocasião + tamanho) com 1 pergunta. NÃO liste todos os preços. No máx. 2–3 opções depois."
      : null,
    isCatalogAsk(params.userMessage) || wantsKitChange(params.userMessage)
      ? "Catálogo/mudança: sugira no máximo 2–3 kits do Catálogo alinhados ao pedido. Use campanhas do Instagram se couber. Não despeje a lista toda."
      : null,
    "PROIBIDO recomeçar a conversa ou fingir que é o primeiro contato.",
  ]
    .filter(Boolean)
    .join("\n");

  const baseMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: `Contexto:\n${contextBlock}` },
    ...history,
  ];

  const models = resolveChatModels();

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

        replyText = sanitizeReply(choiceText(choice));
        break;
      }
      if (replyText) return { responseText: replyText, festaId: ctx.festaId };
    } catch (err: any) {
      console.warn("[funil] tools falhou:", err?.message || err);
    }
  }

  try {
    const completion = await openRouterChat({
      messages: baseMessages,
      withTools: false,
      models,
    });
    const content = sanitizeReply(
      choiceText(completion.choices?.[0]?.message)
    );
    if (content) return { responseText: content, festaId: ctx.festaId };
  } catch (err: any) {
    console.warn("[funil] texto falhou:", err?.message || err);
  }

  if (isCampaignAsk(params.userMessage)) {
    return {
      responseText: campaignFallbackReply(
        params.posts,
        params.contactName,
        slots
      ),
      festaId: ctx.festaId,
    };
  }

  // Último recurso contextual — NUNCA "que bom te ver"
  return {
    responseText: contextualFallback(
      slots,
      params.userMessage,
      params.contactName,
      params.posts
    ),
    festaId: ctx.festaId,
  };
}
