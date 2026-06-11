/**
 * derive-first-message — pure helper that extracts the agent's first WhatsApp
 * greeting for the Overview card.
 *
 * Resolution order (FR-18 — fonte única):
 *   1. `readiness.builderState.persona.greeting` — o greeting CANÔNICO, gravado
 *      pelo submit do card de persona e devolvido pelo
 *      `GET /builder/projects/:id/readiness` que a Overview já consome (o
 *      refetch por activity-signal cobre o pós-submit em tempo real).
 *      Returned as `source: "card"`.
 *   2. Pattern match inside `aiAgent.systemPrompt`: lines starting with
 *      "primeira mensagem:" or "saudação:" (case-insensitive, trimmed). We
 *      capture the inline value OR the first non-empty following line.
 *      Returned as `source: "prompt"`.
 *   3. No data — `{ text: null, source: null }`.
 *
 * All narrowing is explicit; zero `any` on purpose so the Overview tab can
 * rely on the result without runtime surprises.
 */

import type { WorkspaceProject } from "@/client/components/projetos/types"
import type { Readiness } from "@/server/ai-module/builder/state/readiness.types"

export type FirstMessageSource = "card" | "prompt" | null

export interface DerivedFirstMessage {
  text: string | null
  source: FirstMessageSource
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
  readiness: Readiness | null,
): DerivedFirstMessage {
  // 1. Greeting canônico do builderState (card de persona).
  const greeting = readiness?.builderState?.persona?.greeting?.trim()
  if (greeting && greeting.length > 0) {
    return { text: greeting, source: "card" }
  }

  // 2. Fallback: linha "Saudação:" nas instruções do agente.
  const systemPrompt = project.aiAgent?.systemPrompt ?? null
  if (systemPrompt && systemPrompt.length > 0) {
    const fromPrompt = findFirstMessageFromPrompt(systemPrompt)
    if (fromPrompt) return { text: fromPrompt, source: "prompt" }
  }

  return { text: null, source: null }
}
