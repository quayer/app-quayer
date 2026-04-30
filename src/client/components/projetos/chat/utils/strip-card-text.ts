/**
 * Suppresses redundant assistant text when a rich interactive card
 * already presents the same options to the user. Keeps only the first
 * sentence (the question/intro) and removes the explanatory body.
 *
 * Rule: if the message contains a completed result for any STRIP_TOOLS
 * tool AND the text is longer than MIN_LEN chars, truncate to the first
 * natural break (double newline or sentence end).
 */

import type { ToolCallView } from "../hooks/use-chat-stream"

/** Tools whose cards fully replace any list/explanation in the text */
const STRIP_TOOLS = new Set([
  "select_channel",
  "propose_tool_selection",
  "propose_plan_upgrade",
  "propose_agent_creation",
  "adjust_prompt_tone",
])

/** Only strip if text is longer than this (avoid cutting short messages) */
const MIN_LEN = 80

/** Max position to look for a natural cut point */
const MAX_CUT = 220

export function stripCardText(
  text: string,
  toolCalls: ToolCallView[],
): string {
  if (!text || toolCalls.length === 0) return text

  const hasCard = toolCalls.some(
    (tc) => STRIP_TOOLS.has(tc.toolName) && tc.result !== undefined,
  )
  if (!hasCard || text.length < MIN_LEN) return text

  const doubleBreak = text.indexOf("\n\n")
  const sentenceEnd = text.search(/\.\s/)

  const cut =
    doubleBreak > 0 && doubleBreak < MAX_CUT
      ? doubleBreak
      : sentenceEnd > 0 && sentenceEnd < MAX_CUT
        ? sentenceEnd + 1
        : -1

  return cut > 0 ? text.slice(0, cut).trim() : text
}
