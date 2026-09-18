//import OpenAI from "openai";

const dotenv = require('dotenv');
dotenv.config({expand: true});

export default {
  
  jwtSecret: process.env.JWT_SECRET || 'Jtl1mA-Loty11NscguiarA@opneSource_Jwtf',
  jwtRefreshSecret: process.env.JWT_SECRET_REFRESH || 'secret_refresh',
  port: process.env.PORT || 3001,
  timezone: process.env.TIMEZONE || 'America/Sao_Paulo',

  whatsApp: {
    admin: process.env.ADMIN_WHATSAPP_NUMBER,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    //apiUrl: process.env.WHATSAPP_API_URL,
    url: process.env.WHATSAPP_API_URL
  },

  instagram: {
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
    businessId: process.env.INSTAGRAM_BUSINESS_ID,
    apiUrl: process.env.INSTAGRAM_API_URL,
    
  },
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY
  },
  openrout: {
    apiKey: process.env.OPENROUTE_API_KEY || process.env.OPENROUTER_API_KEY,
    url:  process.env.OPENROUTE_URL || process.env.OPENROUTER_URL,
    openUrl: process.env.URL_OPENROUTE || process.env.OPENROUTER_CHAT_URL,
    /** Modelo principal (recomendado: openai/gpt-4o-mini ou anthropic/claude-3.5-haiku) */
    model:
      process.env.OPENROUTE_MODEL ||
      process.env.OPENROUTER_MODEL ||
      process.env.AI_MODEL ||
      "",
  },
  
  djdecor: {
    baseUrl: process.env.DJDECOR_API_URL || process.env.DJDECOR_URL || '',
    apiToken: process.env.DJDECOR_API_TOKEN || process.env.IA_SERVICE_TOKEN || '',
  }

};

/**
 * Ordem de modelos para a Debysinha.
 * 1) OPENROUTE_MODEL (pago/inteligente) — defina no Render
 * 2) fallbacks bons no OpenRouter
 * 3) free só como último recurso
 */
export function resolveChatModels(): string[] {
  const preferred = String(
    process.env.OPENROUTE_MODEL ||
      process.env.OPENROUTER_MODEL ||
      process.env.AI_MODEL ||
      ""
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const smartFallbacks = [
    "openai/gpt-4o-mini",
    "google/gemini-2.5-flash",
    "anthropic/claude-3.5-haiku",
    "openai/gpt-4o",
  ];

  const freeFallbacks = [
    "openrouter/free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "google/gemma-4-31b-it:free",
    "openai/gpt-oss-120b:free",
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of [...preferred, ...smartFallbacks, ...freeFallbacks]) {
    if (!m || seen.has(m)) continue;
    if (/^gpt-5\./i.test(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

 /** @deprecated use resolveChatModels() */
 export const freeModeles = resolveChatModels();
  