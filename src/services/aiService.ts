import config, { freeModeles } from '../config';
import { Sentiment } from './sentimentService';

export async function generateAIResponse(
    message: string,
    sentiment: Sentiment,
    isWeekend: boolean,
    posts: any[]
    ): Promise<string>{

    const postsText = posts.map((p, i) => 
    `${i + 1}. ${p.caption || 'Sem legenda'} - ${p.permalink}`
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
      'ATENÇÃO: É FIM DE SEMANA! Nossos atendentes humanos não estão trabalhando. Você deve ser extremamente acolhedor, resolver o máximo de dúvidas e informar que os atendentes humanos retornam na segunda-feira.' : 
      'Hoje é dia útil. Você pode oferecer a opção de falar com um atendente humano.'}
    
      Sentimento do cliente: ${sentiment}
      ${sentiment === 'negative' ? 'O cliente está insatisfeito. Seja empático e tente resolver o problema. OFEREÇA CONTATO COM HUMANO URGENTEMENTE.' : ''}
    
      ÚLTIMAS POSTAGENS DO INSTAGRAM (use quando pedirem fotos/inspirações):
      ${postsText || 'Nenhuma postagem disponível no momento'}
      Últimas postagens do Instagram:
      
      Regras importantes:
      - Se perguntar sobre fotos de decoração, mencione as postagens acima
      - Se pedirem fotos, ofereça os links do Instagram acima
      - Para agendamentos, pergunte a data e horário preferidos
      - Se for orçamento simples, peça nome, data e tamanho da ornamentação
      - Nunca prometa o que não pode cumprir
      - Nunca diga que não pode ajudar - sempre ofereça uma alternativa
      - Seja profissional e caloroso(a)
      - Use emojis adequados relacionados a decorações de festa (💍, 💒, 🌸, 🕯️, 🥂)
      - Respostas curtas e objetivas (máximo 3 parágrafos)
      - Se for fim de semana, informe que o time humano retorna na segunda
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
      return data.choices[0].message.content; // retorna no primeiro que funcionar
        
      } catch (error: any) {
        console.warn(`Falha com ${model}, tentando próximo...`, error.message);
      }

    
  //const response = await openai.chat.completions.create({
 /* const response = await client.chat.completions.create({
    model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ],
    temperature: 0.7,
    max_tokens: 500
  });

  const res = response.choices[0].message.content;
  console.log("Resposta IA: ", res);
  return res || 'Desculpe, não consegui processar sua mensagem.';*/

}
throw new Error("Nenhum modelo gratuito respondeu corretamente.");
}