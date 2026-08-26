"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeSentiment = analyzeSentiment;
const config_1 = __importStar(require("../config"));
async function analyzeSentiment(text) {
    const openRouterUrl = config_1.default.openrout.openUrl || 'https://openrouter.ai/api/v1/chat/completions';
    const prompt = `
    Analise o sentimento da seguinte mensagem e responda apenas com uma palavra:
    "positive", "neutral" ou "negative".

    Mensagem: "${text}"
  `;
    for (const model of config_1.freeModeles) {
        try {
            const response = await fetch(openRouterUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${config_1.default.openrout.apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 10
                })
            });
            if (!response.ok) {
                throw new Error(`Erro no modelo ${model}: ${response.statusText}`);
            }
            const data = await response.json();
            const raw = data.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
            if (raw.includes('positive'))
                return 'positive';
            if (raw.includes('negative'))
                return 'negative';
            if (raw.includes('neutral'))
                return 'neutral';
            console.warn(`Modelo ${model} retornou sentimento não reconhecido: "${raw}"`);
        }
        catch (error) {
            console.warn(`Falha ao analisar sentimento com ${model}, tentando próximo...`, error.message);
        }
    }
    return 'neutral';
}
//# sourceMappingURL=sentimentService.js.map