import config, { freeModeles } from '../config';
import { Sentiment } from './sentimentService';

export async function generateAIResponse(
    message: string,
    sentiment: Sentiment,
    isWeekend: boolean,
    posts: any[]
    ): Promise<string>{

    const postsText = posts.map((p, i) => 
    `${i + 1}. ${p.caption || 'Novas publicações no Instagran' || 'Sem legenda'} - ${p.permalink}`
    ).join('\n');

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

  
    for(let model of freeModeles){

      try {
        const openRouterUrl = config.openrout.openUrl || config.openrout.url || 'https://openrouter.ai/api/v1/chat/completions';
        const response = await fetch(`${openRouterUrl}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.openrout.apiKey}`,
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
      
      // retorna no primeiro que funcionar
      return data.choices[0].message.content || 'Desculpe, não consegui processar sua mensagem.';
        
      } catch (error: any) {
        console.warn(`Falha com o modelo ${model}, tentando próximo...`, error.message);
      }

}
throw new Error("Nenhum modelo gratuito respondeu corretamente.");
}