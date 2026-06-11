/**
 * Parser SSE local do Playground.
 *
 * O endpoint `/api/v1/builder/projects/:id/playground/stream` emite blocos
 * `data: <json>\n\n` com os AgentStreamEvent do runtime. Este parser espelha o
 * parser inline do chat (`chat/use-chat-stream.ts`) — mantido LOCAL porque o
 * Playground é stateless e não deve depender do hook do chat, e o util antigo
 * (`chat/utils/parse-sse-buffer.ts`) era um stub que nunca parseava evento
 * nenhum (a resposta do agente jamais renderizava).
 */

export type PlaygroundSseEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolName: string; args: Record<string, unknown> }
  | { type: "tool-result"; toolName: string; result: unknown }
  | {
      type: "finish"
      toolCalls?: Array<{
        toolName: string
        args: Record<string, unknown>
        result: unknown
      }>
    }
  | { type: "error"; message: string }

/**
 * Consome o buffer acumulado do stream: blocos completos (terminados em
 * `\n\n`) viram eventos; o bloco parcial restante volta em `rest` para a
 * próxima leitura do reader. Payloads não-JSON são ignorados com log no
 * console — nunca quebram o stream.
 */
export function parseSseBuffer(buffer: string): {
  events: PlaygroundSseEvent[]
  rest: string
} {
  const events: PlaygroundSseEvent[] = []
  const parts = buffer.split("\n\n")
  const rest = parts.pop() ?? ""

  for (const raw of parts) {
    if (!raw.trim()) continue
    const dataLines: string[] = []
    for (const line of raw.split("\n")) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart())
    }
    if (dataLines.length === 0) continue
    const payload = dataLines.join("\n")
    try {
      events.push(JSON.parse(payload) as PlaygroundSseEvent)
    } catch (err) {
      console.error("[playground] SSE parse failed", err, payload)
    }
  }

  return { events, rest }
}
