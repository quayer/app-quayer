import type { ChatMessage } from "@/client/components/projetos/types"

/** Extract set of completed tool names from messages */
export function getCompletedToolNames(messages: ChatMessage[]): Set<string> {
  const names = new Set<string>()
  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.toolCalls) continue
    for (const tc of msg.toolCalls) {
      if (!tc.result) continue
      const r = tc.result as Record<string, unknown>
      if (r.success === false) continue
      names.add(tc.toolName)
    }
  }
  return names
}
