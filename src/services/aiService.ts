import config, { freeModeles } from '../config';
import { Sentiment } from './sentimentService';

export async function generateAIResponse(
    message: string,
    sentiment: Sentiment,
    isWeekend: boolean,
    posts: any[],
    clientName?: string
    ): Promise<string>{

    const postsText = posts.map((p, i) => 
    `${i + 1}. ${p.caption || 'Novas publicações no Instagran' || 'Sem legenda'} - ${p.permalink}`
    ).join('\n');

    const systemPrompt = `Você é a *Debysinha*, amiga carinhosa e atenciosa da Debora Pimentel Decoradora (@debora_pimentel_decoradora).

Tom: acolhedora, presente, nunca evasiva. Dê 1–2 dicas práticas quando couber. Respostas curtas a médias (3–6 frases). Uma pergunta principal.

${isWeekend ? `Fim de semana: a equipe está em festa; você ajuda agora e humanos voltam na segunda (Lorena, Suellem, Vitória, Rodrigo, Debora).` : `Durante a semana você ajuda na hora; se pedirem, chama um atendente.`}

${clientName ? `Cliente: ${clientName.split(' ')[0]}.` : ''}
${sentiment === 'negative' ? `Cliente parece chateado — acolha com carinho e ofereça passar para um humano.` : ''}

Se pedir fotos/inspirações, use os posts abaixo e sugira algo concreto (tema/cores/kit).
${postsText ? `Posts:\n${postsText}` : ''}
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
          temperature: 0.5,
          max_tokens: 420
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