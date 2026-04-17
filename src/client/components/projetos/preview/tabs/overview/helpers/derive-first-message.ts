/**
 * derive-first-message — pure helper that extracts the agent's first WhatsApp
 * greeting from the Builder conversation (or, as a fallback, from the system
 * prompt itself).
 *
 * Resolution order:
 *   1. Latest assistant tool call whose name looks like a greeting generator
 *      (`saudacao|greeting|first-message|welcome`). We narrow `result` to an
 *      object exposing `message`/`text`/`greeting` and return it as
 *      `source: "tool_result"`.
 *   2. Pattern match inside `aiAgent.systemPrompt`: lines starting with
 *      "primeira mensagem:" or "saudação:" (case-insensitive, trimmed). We
 *      capture the inline value OR the first non-empty following line.
 *      Returned as `source: "manual"`.
 *   3. No data — `{ text: null, source: null }`.
 *
 * All narrowing is explicit; zero `any` on purpose so the Overview tab can
 * rely on the result without runtime surprises.
 */

import type {
  ChatMessage,
  WorkspaceProject,
} from "@/client/components/projetos/types"

export type FirstMessageSource = "tool_result" | "manual" | null

export interface DerivedFirstMessage {
  text: string | null
  source: FirstMessageSource
}

/** Tool-call names that plausibly generate the WhatsApp greeting. */
const GREETING_TOOL_PATTERN = /saudacao|saudação|greeting|first[-_]?message|welcome/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * Pull a string out of common shapes a greeting tool might return, e.g.
 *   { message: "Olá!" }
 *   { text: "Olá!" }
 *   { greeting: "Olá!" }
 *   { data: { message: "Olá!" } }
 */
function extractGreetingText(result: unknown): string | null {
  if (!isRecord(result)) return null

  for (const key of ["message", "text", "greeting", "content"] as const) {
    const value = result[key]
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim()
    }
  }

  // Nested `{ data: { ... } }` envelope.
  if (isRecord(result.data)) {
    return extractGreetingText(result.data)
  }

  return null
}

function findFirstMessageFromTools(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg || msg.role !== "assistant" || !msg.toolCalls) continue
    for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
      const call = msg.toolCalls[j]
      if (!call || !GREETING_TOOL_PATTERN.test(call.toolName)) continue
      const text = extractGreetingText(call.result)
      if (text) return text
    }
  }
  return null
}

/**
 * Look for a "primeira mensagem:" / "saudação:" / "greeting:" marker inside
 * the system prompt and return the captured value.
 */
function findFirstMessageFromPrompt(systemPrompt: string): string | null {
  // Matches label + inline value on same line.
  const inline =
    /^[ \t]*(?:primeira\s+mensagem|saudação|saudacao|greeting)\s*:\s*(.+)$/im.exec(
      systemPrompt,
    )
  if (inline && typeof inline[1] === "string") {
    const cleaned = stripQuotes(inline[1].trim())
    if (cleaned.length > 0) return cleaned
  }

  // Fallback: label on its own line, value on the next non-empty line.
  const multi =
    /^[ \t]*(?:primeira\s+mensagem|saudação|saudacao|greeting)\s*:\s*$\s*([^\n]+)/im.exec(
      systemPrompt,
    )
  if (multi && typeof multi[1] === "string") {
    const cleaned = stripQuotes(multi[1].trim())
    if (cleaned.length > 0) return cleaned
  }

  return null
}

function stripQuotes(value: string): string {
  return value.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "").trim()
}

export function deriveFirstMessage(
  project: WorkspaceProject,
  messages: ChatMessage[],
): DerivedFirstMessage {
  const fromTools = findFirstMessageFromTools(messages)
  if (fromTools) return { text: fromTools, source: "tool_result" }

  const systemPrompt = project.aiAgent?.systemPrompt ?? null
  if (systemPrompt && systemPrompt.length > 0) {
    const fromPrompt = findFirstMessageFromPrompt(systemPrompt)
    if (fromPrompt) return { text: fromPrompt, source: "manual" }
  }

  return { text: null, source: null }
}
