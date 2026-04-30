/**
 * Shared SSE parser for Builder IA chat streams.
 *
 * Used by both the main chat (use-chat-stream.ts) and the playground tab.
 */

export type SseEvent =
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

/** Parses an SSE buffer into discrete events plus the unconsumed tail. */
export function parseSseBuffer(buffer: string): {
  events: SseEvent[]
  rest: string
} {
  const events: SseEvent[] = []
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
      events.push(JSON.parse(payload) as SseEvent)
    } catch (err) {
      console.error("[sse] parse failed", err, payload)
    }
  }
  return { events, rest }
}
