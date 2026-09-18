import config, { resolveChatModels } from "../config";
import { Sentiment } from "./sentimentService";

export async function generateAIResponse(
  message: string,
  sentiment: Sentiment,
  isWeekend: boolean,
  posts: any[],
  clientName?: string
): Promise<string> {
  const postsText = posts
    .map(
      (p, i) =>
        `${i + 1}. ${p.caption || "Novas publicações no Instagram"} - ${p.permalink || ""}`
    )
    .join("\n");

  const systemPrompt = `Você é a Debysinha, amiga atenciosa da Debora Pimentel Decoradora (@debora_pimentel_decoradora).

Fale como gente no WhatsApp: natural, carinhosa, sem script.
- Cumprimento / “posso falar?” → acolha e espere (sem pedir data/kit).
- Campanha → use os posts abaixo e explique com carinho.
- Decoração → 1–2 dicas e avance com leveza.
- 2–5 frases. Varie o jeito de falar.

${
  isWeekend
    ? `Fim de semana: a equipe está em festa; você ajuda agora e humanos voltam na segunda (Lorena, Suellem, Vitória, Rodrigo, Debora).`
    : `Durante a semana você ajuda na hora; se pedirem, chama um atendente.`
}

${clientName ? `Cliente: ${clientName.split(" ")[0]}.` : ""}
${
  sentiment === "negative"
    ? `Cliente parece chateado — acolha com carinho e ofereça passar para um humano.`
    : ""
}

Campanhas/posts:
${postsText ? postsText : "(nenhum no momento)"}
`;

  for (const model of resolveChatModels()) {
    try {
      const openRouterUrl =
        config.openrout.openUrl ||
        config.openrout.url ||
        "https://openrouter.ai/api/v1/chat/completions";
      const response = await fetch(`${openRouterUrl}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openrout.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          temperature: 0.8,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro no modelo ${model}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`Resposta de ${model}:`, data.choices[0].message.content);

      return (
        data.choices[0].message.content ||
        "Desculpe, não consegui processar sua mensagem."
      );
    } catch (error: any) {
      console.warn(
        `Falha com o modelo ${model}, tentando próximo...`,
        error.message
      );
    }
  }
  throw new Error("Nenhum modelo respondeu corretamente.");
}
