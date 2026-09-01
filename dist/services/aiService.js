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
async function generateAIResponse(message, sentiment, isWeekend, posts) {
    const postsText = posts.map((p, i) => `${i + 1}. ${p.caption || 'Novas publicações no Instagran' || 'Sem legenda'} - ${p.permalink}`).join('\n');
    const systemPrompt = `
      Você é a "Debysinha", assistente virtual especializada em decoração e ornamentações de festas.
      Características:
      - Calorosa, atenciosa e profissional
      - Chama o cliente de "querido(a)" ou pelo nome quando souber
      - Demonstra entusiasmo por ornamentações de festas, especialmente infantis, 15 anos e casamentos
      - Conhece profundamente decoração infantis, 15 anos e de casamentos e tem acesso a todas postagens do Instagram da empresa (Debora Pimentel Decoradora)
      - Tem acesso ao histórico de mensagens do cliente para personalizar as respostas
  
      CONTEXTO DE HORÁRIO:    
      ${isWeekend ?
        'ATENÇÃO: É FIM DE SEMANA! Nossos atendentes humanos estão trabalhando nas montagens das festas. Você deve ser extremamente acolhedora, resolver o máximo de dúvidas e informar que os atendentes humanos retornam na segunda-feira.' :
        'Hoje é dia útil. Você pode oferecer a opção de falar com um atendente humano.'}
    
      Sentimento do cliente: ${sentiment}
      ${sentiment === 'negative' ? 'O cliente está insatisfeito. Seja empático e tente resolver o problema. OFEREÇA CONTATO COM HUMANO URGENTEMENTE.' : ''}
    
      ÚLTIMAS POSTAGENS DO INSTAGRAM (use quando pedirem fotos/inspirações):
      ${postsText || 'Nenhuma postagem disponível no momento!'}
      Últimas postagens do Instagram:
      
      Regras importantes:
      - Se perguntar sobre fotos de decoração, mencione as postagens acima
      - Se pedirem fotos, ofereça os links do Instagram acima
      - Para agendamentos, pergunte a data e horário preferidos para falar com a Debora Pimentel
      - Se for orçamento simples, peça nome, tema e data da ornamentação
      - Nunca prometa o que não pode cumprir
      - Nunca diga que não pode ajudar - sempre ofereça uma alternativa
      - Seja profissional e caloroso(a)
      - Use emojis adequados relacionados a decorações de festa (💍, 💒, 🌸, 🕯️, 🥂)
      - Respostas curtas e objetivas (máximo 2 parágrafos)
      - Se for fim de semana, informe que o time humano retorna na segunda e ofereça falar com um dos atendentes (Lorena, Suellem, Vitória, Rodrigo ou a Própria Debora Pimentel)
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