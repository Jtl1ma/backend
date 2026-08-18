import config, { freeModeles } from "../config";

export type Sentiment = 'positive' | 'neutral' | 'negative';

export async function analyzeSentiment(text: string): Promise<Sentiment> {
  const openRouterUrl = config.openrout.openUrl || 'https://openrouter.ai/api/v1/chat/completions';
  const prompt = `
    Analise o sentimento da seguinte mensagem e responda apenas com uma palavra:
    "positive", "neutral" ou "negative".

    Mensagem: "${text}"
  `;

  for (const model of freeModeles) {
    try {
      const response = await fetch(openRouterUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.openrout.apiKey}`,
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

      if (raw.includes('positive')) return 'positive';
      if (raw.includes('negative')) return 'negative';
      if (raw.includes('neutral')) return 'neutral';

      console.warn(`Modelo ${model} retornou sentimento não reconhecido: "${raw}"`);
    } catch (error: any) {
      console.warn(`Falha ao analisar sentimento com ${model}, tentando próximo...`, error.message);
    }
  }

  return 'neutral'; // Default caso nenhum modelo funcione
}
