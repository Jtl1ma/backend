/**
 * Ontologia de temas ↔ intenções do cliente ↔ hashtags das postagens.
 * Objetivo: "casamento elegante" achar #casamentoluxo; "fazendinha menino"
 * achar #fazendinhamenino / #festafazendinha; "neon" achar #NeonParty.
 */

export type ThemeFamily = {
  id: string;
  /** Como o cliente pede */
  intents: string[];
  /** Hashtags nas legendas (sem #, minúsculo, sem acento) */
  hashtags: string[];
  /** Palavras na legenda (não hashtag) */
  keywords?: string[];
};

function stripAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function normalizeTemaText(s: string): string {
  return stripAccents(s)
    .replace(/[#_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function temaHashtagSlug(tema: string): string {
  return normalizeTemaText(tema).replace(/[^a-z0-9]+/g, "");
}

export function extractHashtags(caption: string): string[] {
  const raw = stripAccents(caption);
  const tags = raw.match(/#[a-z0-9]+/gi) || [];
  return tags.map((t) => t.replace(/^#/, "").toLowerCase());
}

export function detectGenderModifier(
  text: string
): "menino" | "menina" | null {
  const t = normalizeTemaText(text);
  if (/\b(meninos?|masculino|para\s+ele|dele)\b/.test(t)) return "menino";
  if (/\b(meninas?|feminino|para\s+ela|dela)\b/.test(t)) return "menina";
  return null;
}

export function detectStyleModifiers(text: string): string[] {
  const t = normalizeTemaText(text);
  const found: string[] = [];
  if (/\b(luxo|luxury|premium)\b/.test(t)) found.push("luxo");
  if (/\b(elegante|elegant[ee]?)\b/.test(t)) found.push("elegante");
  if (/\b(moderno|modern[ao]?|clean|minimal)\b/.test(t)) found.push("moderno");
  if (/\b(rustico|r[uú]stico|campo)\b/.test(t)) found.push("rustico");
  if (/\b(infantil|kids|bebe|beb[eê])\b/.test(t)) found.push("infantil");
  return found;
}

/** Tamanhos/kits do catálogo ↔ hashtags que você coloca nas postagens. */
export type KitSizeId =
  | "pocket"
  | "media"
  | "intermediaria"
  | "decoracao-4m"
  | "decoracao-6m"
  | "festa-mesa";

export const KIT_SIZE_HASHTAGS: Record<KitSizeId, string[]> = {
  pocket: [
    "pocket",
    "poket",
    "festapocket",
    "kitpocket",
    "pocketfesta",
    "festapoket",
  ],
  media: [
    "festamedia",
    "media",
    "kitmedia",
    "tamanhomedia",
    "festamedi",
    "kitfestamedia",
  ],
  intermediaria: [
    "intermediaria",
    "festaintermediaria",
    "kitintermediaria",
    "intermediario",
  ],
  "decoracao-4m": [
    "4m",
    "decoracao4m",
    "festa4m",
    "4metros",
    "kit4m",
    "decor4m",
  ],
  "decoracao-6m": [
    "6m",
    "decoracao6m",
    "festa6m",
    "6metros",
    "kit6m",
    "decor6m",
  ],
  "festa-mesa": [
    "festanamesa",
    "festamesa",
    "pegueemonte",
    "mesa",
    "kitfestanamesa",
  ],
};

/** Detecta tamanho/kit pedido pelo cliente (inclui typo poket). */
export function detectKitSize(text: string): KitSizeId | null {
  const t = normalizeTemaText(text);
  if (/\b(6\s*m|6\s*metros|decoracao\s*6|festa\s+grande\s+de\s*6)\b/.test(t)) {
    return "decoracao-6m";
  }
  if (/\b(4\s*m|4\s*metros|decoracao\s*4)\b/.test(t)) {
    return "decoracao-4m";
  }
  if (/\b(pocket|poket|pochet)\b/.test(t)) return "pocket";
  if (/\b(intermedi[aá]ria|intermediario)\b/.test(t)) return "intermediaria";
  if (
    /\b(festa\s+m[eé]dia|kit\s+(de\s+)?festa\s+m[eé]dia|tamanho\s+m[eé]di[oa]|m[eé]dia)\b/.test(
      t
    )
  ) {
    return "media";
  }
  if (/\b(festa\s+na\s+mesa|pegue\s*e\s*monte)\b/.test(t)) return "festa-mesa";
  return null;
}

/** +2 tamanho certo, 0 neutro, -1 tamanho errado explícito na legenda. */
export function kitSizeMatchBonus(
  caption: string,
  kitSize: KitSizeId | null
): number {
  if (!kitSize) return 0;
  const tags = extractHashtags(caption);
  const want = KIT_SIZE_HASHTAGS[kitSize] || [];
  const allSizeTags = Object.values(KIT_SIZE_HASHTAGS).flat();

  const hasWant = tags.some((t) =>
    want.some((w) => t === w || tagsOverlap(t, w))
  );
  if (hasWant) return 2;

  // Tem hashtag de OUTRO tamanho?
  const hasOther = tags.some((t) => {
    if (!allSizeTags.some((w) => t === w || tagsOverlap(t, w))) return false;
    return !want.some((w) => t === w || tagsOverlap(t, w));
  });
  if (hasOther) return -1;
  return 0;
}

/** Famílias de tema com variações reais de hashtag do Instagram. */
export const THEME_FAMILIES: ThemeFamily[] = [
  {
    id: "casamento",
    intents: [
      "casamento",
      "casamento moderno",
      "casamento elegante",
      "casamento luxo",
      "decoracao de casamento",
      "decoracao casamento",
      "wedding",
      "noivos",
      "mesa de casamento",
    ],
    hashtags: [
      "casamento",
      "casamentoluxo",
      "casamentomoderno",
      "casamentoelegante",
      "decoracaodecasamento",
      "decoracaocasamento",
      "mesacasamento",
      "wedding",
      "weddingdecor",
      "noivos",
      "casamentorustico",
    ],
    keywords: ["casamento", "noivos", "wedding", "bride"],
  },
  {
    id: "fazendinha",
    intents: [
      "fazendinha",
      "fazenda",
      "festa fazendinha",
      "fazendinha menino",
      "fazendinha menina",
      "tema fazendinha",
    ],
    hashtags: [
      "fazendinha",
      "festafazendinha",
      "fazendinhamenino",
      "fazendinhamenina",
      "fazenda",
      "temafazendinha",
      "decoracaofazendinha",
    ],
    keywords: ["fazendinha", "fazenda"],
  },
  {
    id: "neon",
    intents: [
      "neon",
      "festa neon",
      "neon party",
      "balada neon",
      "festa glow",
      "glow",
    ],
    hashtags: [
      "neon",
      "neonparty",
      "festaneon",
      "glow",
      "glowparty",
      "baladaneon",
      "festaglow",
    ],
    keywords: ["neon", "glow"],
  },
  {
    id: "fundo-do-mar",
    intents: [
      "fundo do mar",
      "sereia",
      "oceano",
      "under the sea",
      "peixinho",
      "nemo",
    ],
    hashtags: [
      "fundodomar",
      "festafundodomar",
      "sereia",
      "festasereia",
      "oceano",
      "underthesea",
      "peixinho",
      "nemo",
      "aquario",
    ],
    keywords: ["fundo do mar", "sereia", "oceano", "nemo"],
  },
  {
    id: "cha-revelacao",
    intents: [
      "cha revelacao",
      "cha de revelacao",
      "gender reveal",
      "revelacao",
      "cha revelacao menino",
      "cha revelacao menina",
    ],
    hashtags: [
      "charevelacao",
      "chaderevelacao",
      "genderreveal",
      "revelacao",
      "charevelacaomenino",
      "charevelacaomenina",
      "festarevelacao",
    ],
    keywords: ["revelacao", "gender reveal", "menino ou menina"],
  },
  {
    id: "sitio-pica-pau",
    intents: [
      "sitio do pica pau",
      "sitio do picapau",
      "pica pau amarelo",
      "picapau",
      "monteiro lobato",
    ],
    hashtags: [
      "sitiodopicapaualamarelo",
      "sitiodopicapauamarelo",
      "picapau",
      "picapauamarelo",
      "sitiodopicapau",
      "monteurolobato",
      "monteirolobato",
    ],
    keywords: ["pica pau", "picapau", "monteiro lobato"],
  },
  {
    id: "safari",
    intents: ["safari", "selva", "jungle", "safari menino", "safari menina"],
    hashtags: [
      "safari",
      "festasafari",
      "safarimenino",
      "safarimenina",
      "selva",
      "jungle",
      "temasafari",
    ],
    keywords: ["safari", "selva", "jungle"],
  },
  {
    id: "boteco",
    intents: ["boteco", "barzinho", "boteco zen"],
    hashtags: ["boteco", "festaboteco", "barzinho", "botecozen", "temaboteco"],
    keywords: ["boteco", "barzinho"],
  },
  {
    id: "minnie",
    intents: ["minnie", "mickey", "minnie vermelha", "minnie rosa"],
    hashtags: [
      "minnie",
      "festaminnie",
      "minnierosa",
      "minnievermelha",
      "mickey",
      "festamickey",
    ],
    keywords: ["minnie", "mickey"],
  },
  {
    id: "frozen",
    intents: ["frozen", "elsa", "olaf", "frozen 2"],
    hashtags: ["frozen", "festafrozen", "elsa", "olaf", "frozen2"],
    keywords: ["frozen", "elsa", "olaf"],
  },
  {
    id: "bluey",
    intents: ["bluey"],
    hashtags: ["bluey", "festabluey", "temabluey"],
    keywords: ["bluey"],
  },
  {
    id: "looney",
    intents: ["looney", "baby looney", "looney tunes", "baby looney tunes"],
    hashtags: [
      "looney",
      "looneytunes",
      "babylooney",
      "babylooneytunes",
      "festalooney",
    ],
    keywords: ["looney", "looney tunes"],
  },
  {
    id: "ursinho",
    intents: ["ursinho", "ursinha", "chá de ursinho", "cha de ursinho"],
    hashtags: [
      "ursinho",
      "ursinha",
      "festursinho",
      "chaursinho",
      "teddy",
      "bear",
    ],
    keywords: ["ursinho", "ursinha", "teddy"],
  },
  {
    id: "dinosaurio",
    intents: ["dinossauro", "dinosaurio", "dino"],
    hashtags: ["dinossauro", "dino", "festadino", "festadinossauro"],
    keywords: ["dinossauro", "dino"],
  },
  {
    id: "unicornio",
    intents: ["unicornio", "unicórnio"],
    hashtags: ["unicornio", "festaunicornio", "temaunicornio"],
    keywords: ["unicornio"],
  },
  {
    id: "jardim",
    intents: ["jardim", "jardim encantado", "borboletas"],
    hashtags: [
      "jardim",
      "jardimencantado",
      "festajardim",
      "borboletas",
      "temajardim",
    ],
    keywords: ["jardim", "borboleta"],
  },
  {
    id: "moranguinho",
    intents: ["moranguinho", "strawberry"],
    hashtags: ["moranguinho", "festamoranguinho", "strawberry"],
    keywords: ["moranguinho"],
  },
  {
    id: "happy-birthday",
    intents: [
      "happy birthday",
      "happy birthday led",
      "preto e branco",
      "preto e dourado",
    ],
    hashtags: [
      "happybirthday",
      "happybirthdayled",
      "pretoebranco",
      "pretoedourado",
      "festaled",
    ],
    keywords: ["happy birthday", "led"],
  },
  {
    id: "discoteca",
    intents: ["discoteca", "disco", "anos 80", "anos 70"],
    hashtags: ["discoteca", "disco", "festadisco", "anos80", "anos70"],
    keywords: ["discoteca", "disco"],
  },
  {
    id: "mario",
    intents: ["mario", "mario bros", "super mario"],
    hashtags: ["mario", "mariobros", "supermario", "festamario"],
    keywords: ["mario"],
  },
  {
    id: "luccas-neto",
    intents: ["luccas neto", "lucas neto"],
    hashtags: ["luccasneto", "lucasneto", "festaluccasneto"],
    keywords: ["luccas neto", "lucas neto"],
  },
];

export type ResolvedThemeQuery = {
  raw: string;
  normalized: string;
  slug: string;
  family: ThemeFamily | null;
  gender: "menino" | "menina" | null;
  styles: string[];
  /** Todos os slugs/hashtags a procurar */
  searchTags: string[];
};

export function resolveThemeQuery(tema: string): ResolvedThemeQuery {
  const normalized = normalizeTemaText(tema);
  const slug = temaHashtagSlug(tema);
  const gender = detectGenderModifier(tema);
  const styles = detectStyleModifiers(tema);

  let best: ThemeFamily | null = null;
  let bestLen = 0;
  for (const fam of THEME_FAMILIES) {
    for (const intent of fam.intents) {
      const ni = normalizeTemaText(intent);
      if (normalized.includes(ni) || ni.includes(normalized)) {
        if (ni.length > bestLen) {
          best = fam;
          bestLen = ni.length;
        }
      }
    }
  }

  const searchTags = new Set<string>();
  if (slug.length >= 3) searchTags.add(slug);
  if (best) {
    for (const h of best.hashtags) searchTags.add(temaHashtagSlug(h));
    for (const intent of best.intents) {
      const s = temaHashtagSlug(intent);
      if (s.length >= 4) searchTags.add(s);
    }
  }

  // Combinações com gênero: fazendinha + menino → fazendinhamenino
  if (best && gender) {
    for (const h of best.hashtags) {
      const base = temaHashtagSlug(h);
      if (base.includes("menino") || base.includes("menina")) continue;
      searchTags.add(`${base}${gender}`);
      searchTags.add(`${gender}${base}`);
    }
    searchTags.add(`${slug}${gender}`);
  }

  // Estilo: casamento + luxo → casamentoluxo
  if (best && styles.length) {
    for (const st of styles) {
      searchTags.add(`${slug}${temaHashtagSlug(st)}`);
      for (const h of best.hashtags) {
        if (h.includes(temaHashtagSlug(st))) searchTags.add(h);
      }
    }
  }

  return {
    raw: tema,
    normalized,
    slug,
    family: best,
    gender,
    styles,
    searchTags: Array.from(searchTags).filter((t) => t.length >= 3),
  };
}

/**
 * Relação entre slug pedido e hashtag da legenda.
 * Ex.: fazendinha ⊂ fazendinhamenino; neon ⊂ neonparty.
 */
export function tagsOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const min = 5;
  if (a.length >= min && b.includes(a)) return true;
  if (b.length >= min && a.includes(b)) return true;
  return false;
}

/**
 * Score 0–100 da legenda vs tema pedido (hashtags + intenções + gênero/estilo/tamanho).
 * opts.queryText: mensagem completa (pra pegar "festa média" + tema).
 */
export function scoreCaptionForTheme(
  caption: string | null | undefined,
  tema: string | null,
  opts?: { queryText?: string | null }
): number {
  if (!tema) return 0;
  const raw = String(caption || "");
  if (!raw.trim()) return 0;

  const q = resolveThemeQuery(tema);
  const tags = extractHashtags(raw);
  const capNorm = normalizeTemaText(raw);
  let best = 0;

  // 1) Hashtags da legenda × tags de busca
  for (const tag of tags) {
    for (const want of q.searchTags) {
      if (tag === want) {
        best = Math.max(best, 100);
      } else if (tagsOverlap(tag, want)) {
        best = Math.max(best, 92);
      }
    }

    if (q.gender === "menino" && /menina/.test(tag) && q.family) {
      const baseOk = q.family.hashtags.some((h) =>
        tagsOverlap(tag.replace(/menina/g, ""), temaHashtagSlug(h))
      );
      if (baseOk && !/menino/.test(tag)) {
        best = Math.min(best, 40);
      }
    }
    if (q.gender === "menina" && /menino/.test(tag) && !/menina/.test(tag)) {
      best = Math.min(best, 40);
    }

    if (q.gender && tag.includes(q.gender) && q.family) {
      const related = q.family.hashtags.some((h) =>
        tagsOverlap(tag, temaHashtagSlug(h))
      );
      if (related) best = Math.max(best, 100);
    }
  }

  // 2) Família: qualquer hashtag da família na legenda
  if (q.family) {
    for (const tag of tags) {
      for (const h of q.family.hashtags) {
        if (tagsOverlap(tag, temaHashtagSlug(h))) {
          let score = tag === temaHashtagSlug(h) ? 96 : 88;
          if (
            q.styles.some((st) => tag.includes(temaHashtagSlug(st))) ||
            q.styles.some((st) =>
              temaHashtagSlug(h).includes(temaHashtagSlug(st))
            )
          ) {
            score = 100;
          }
          best = Math.max(best, score);
        }
      }
    }

    for (const kw of q.family.keywords || []) {
      const nk = normalizeTemaText(kw);
      if (nk.length >= 4 && capNorm.includes(nk)) {
        best = Math.max(best, 86);
      }
    }
  }

  // 3) Frase / slug solto na legenda (sem hashtag)
  if (q.normalized.length >= 4 && capNorm.includes(q.normalized)) {
    best = Math.max(best, 95);
  }
  if (
    q.slug.length >= 5 &&
    stripAccents(raw).replace(/[^a-z0-9#]/g, "").includes(q.slug)
  ) {
    best = Math.max(best, 90);
  }

  // 4) Gênero
  if (q.gender && q.family && best >= 85) {
    const other = q.gender === "menino" ? "menina" : "menino";
    const hasRight = tags.some(
      (t) =>
        t.includes(q.gender!) &&
        q.family!.hashtags.some((h) => tagsOverlap(t, temaHashtagSlug(h)))
    );
    const hasWrongOnly = tags.some(
      (t) => t.includes(other) && !t.includes(q.gender!)
    );
    if (hasWrongOnly && !hasRight) {
      best = 45;
    } else if (hasRight) {
      best = Math.max(best, 100);
    }
  }

  // 5) Tamanho/kit (#festamedia #pocket #4m…) — boost se bater com o pedido
  const kitSize = detectKitSize(
    [opts?.queryText || "", tema].filter(Boolean).join(" ")
  );
  if (kitSize && best >= 80) {
    const bonus = kitSizeMatchBonus(raw, kitSize);
    if (bonus > 0) best = Math.min(100, best + 8);
    // tamanho errado explícito: ainda pode servir de tema, mas perde prioridade
    if (bonus < 0) best = Math.max(80, best - 10);
  }

  return best;
}

/** Regex de temas nomeados para extrair da mensagem do cliente. */
export const NAMED_TEMAS_RE =
  /\b(casamento(?:\s+(?:moderno|elegante|luxo|r[uú]stico))?|decora[cç][aã]o\s+de\s+casamento|fundo\s+do\s+mar|ch[aá]\s*(de\s*)?revela[cç][aã]o|gender\s*reveal|s[ií]tio\s+do\s+pica\s*pau(?:\s+amarelo)?|happy\s*birthday|preto\s+e\s+(?:branco|dourado)|minnie|safari|boteco|frozen|bluey|fazendinha(?:\s+menino|\s+menina)?|discoteca|jardim(?:\s+encantado)?|moranguinho|neon(?:\s+party)?|festa\s+neon|sereia|oceano|unicornio|unic[oó]rnio|dinossauro|mario(?:\s+bros)?|luccas?\s+neto|looney\s*tunes|baby\s+looney(?:\s+tunes)?|ursinho|ursinha)\b/i;
