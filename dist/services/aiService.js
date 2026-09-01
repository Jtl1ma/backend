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
exports.generateAIResponse = generateAIResponse;
const config_1 = __importStar(require("../config"));
async function generateAIResponse(message, sentiment, isWeekend, posts, clientName) {
    const postsText = posts.map((p, i) => `${i + 1}. ${p.caption || 'Novas publicações no Instagran' || 'Sem legenda'} - ${p.permalink}`).join('\n');
    const systemPrompt = `
Oi, tudo bem? Eu sou a *Debysinha*, assistente virtual da Debora Pimentel Decoradora! 🌸

Adoro conversar sobre decorações de festas — especialmente infantis, 15 anos e casamentos! É o que me deixa feliz! 💒

${isWeekend ? `
Ah, hoje é fim de semana! Nossos brilhante equipe está por aí montando festas lindíssimas. Eu tô aqui pra te ajudar no que precisar. Pode me perguntar tudo sobre decorações 😊. Se quiser falar diretamente com um de nossos atendentes, eles retornam na segunda-feira: a *Lorena*, a *Suellem*, a *Vitória*, o *Rodrigo* ou a própria *Debora Pimentel*.
` : `
Que bom que você entrou em contato! Durante a semana posso te ajudar na hora ou, se preferir, posso chamar um dos nossos atendentes. É só me pedir! 😊
`}

${clientName ? `Ah, e ${clientName.split(' ')[0]}, que bom ter você aqui!` : `Que bom ter você aqui!`}

${sentiment === 'negative' ? `
Puxa, parece que algo não ficou como você esperava e eu lamento muito por isso 😔. Quero muito te ajudar a resolver. Posso chamar um dos nossos atendentes agora mesmo pra cuidar do seu caso com todo carinho?
` : ''}

Ah, e sabe o que é ótimo? Eu tenho acesso a todas as postagens do Instagram da Debora (@debora_pimentel_decoradora) 📸 — então se quiser ver fotos de decorações, inspirações ou ideias, é só me pedir que eu te mostro!

Em que posso te ajudar hoje, ${clientName ? clientName.split(' ')[0] : 'querido(a)'}? 🌷

${postsText ? `\`\`\`\n${postsText}\`\`\`` : ''}
`;
    for (let model of config_1.freeModeles) {
        try {
            const openRouterUrl = config_1.default.openrout.openUrl || config_1.default.openrout.url || 'https://openrouter.ai/api/v1/chat/completions';
            const response = await fetch(`${openRouterUrl}`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${config_1.default.openrout.apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: message }
                    ],
                    temperature: 0.7,
                    max_tokens: 500
                })
            });
            if (!response.ok) {
                throw new Error(`Erro no modelo ${model}: ${response.statusText}`);
            }
            const data = await response.json();
            console.log(`Resposta de ${model}:`, data.choices[0].message.content);
            return data.choices[0].message.content || 'Desculpe, não consegui processar sua mensagem.';
        }
        catch (error) {
            console.warn(`Falha com o modelo ${model}, tentando próximo...`, error.message);
        }
    }
    throw new Error("Nenhum modelo gratuito respondeu corretamente.");
}
//# sourceMappingURL=aiService.js.map