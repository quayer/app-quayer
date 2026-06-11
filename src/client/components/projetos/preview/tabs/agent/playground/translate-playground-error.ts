/**
 * Tradução dos erros crus do SSE do Playground para copy PT-BR legível.
 *
 * O servidor (`playground-stream.ts`) ainda emite `{ type: 'error', message }`
 * com a mensagem técnica do provider/runtime em inglês, sem `code` tipado.
 * Enquanto o contrato não evolui (fix server-side), mapeamos por padrão de
 * texto no client e preservamos a mensagem original no console para
 * diagnóstico técnico.
 */

const RULES: Array<{ pattern: RegExp; copy: string }> = [
  {
    pattern: /not found or inactive/i,
    copy: "O agente de teste não está disponível no momento. Peça ao Builder para recriar o agente e tente novamente.",
  },
  {
    pattern: /context budget exhausted/i,
    copy: 'A conversa de teste ficou longa demais para o limite do agente. Clique em "Limpar" para começar uma nova conversa.',
  },
  {
    pattern: /x-api-key|api[\s_-]?key|authentication|unauthorized|invalid[\s_-]?token|\b401\b|\b403\b/i,
    copy: "Não foi possível autenticar com o provedor de IA. Verifique a chave de API configurada para a organização.",
  },
  {
    pattern: /rate[\s_-]?limit|too many requests|overloaded|quota|\b429\b|\b529\b/i,
    copy: "O provedor de IA está sobrecarregado no momento. Aguarde alguns segundos e tente novamente.",
  },
  {
    pattern: /failed to fetch|fetch failed|network|timed?\s*out|timeout|econnreset|enotfound|socket/i,
    copy: "Falha de conexão com o provedor de IA. Verifique sua internet e tente novamente.",
  },
]

const FALLBACK =
  "Não foi possível gerar a resposta do agente. Tente novamente em instantes."

/**
 * Converte a mensagem técnica do stream em copy PT-BR acionável para o
 * usuário leigo do Builder. A mensagem crua vai para o console.
 */
export function translatePlaygroundError(raw: string | null | undefined): string {
  const message = (raw ?? "").trim()
  if (message) {
    console.error("[playground] erro do stream:", message)
    for (const { pattern, copy } of RULES) {
      if (pattern.test(message)) return copy
    }
  }
  return FALLBACK
}
