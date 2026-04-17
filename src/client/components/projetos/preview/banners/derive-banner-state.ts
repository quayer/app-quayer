/**
 * derive-banner-state — pure helper that scans chat `messages` to decide which
 * persistent banner(s) should be shown at the top of the PreviewPanel.
 *
 * Two signals, independent:
 *   - `working`: the last assistant message has at least one tool call without
 *     a `result` yet (in-flight). Banner auto-hides when everything settles.
 *   - `error`: any of the five most recent assistant messages has a tool call
 *     whose `result` is an object indicating failure (`success === false` or
 *     presence of an `error` field). The error banner is dismissable per
 *     message id — the caller passes `dismissedErrorId` and we hide the banner
 *     when the latest erroring message matches it.
 *
 * Kept as a pure function so the preview-panel can `useMemo` over
 * `[messages, dismissedErrorId]` without triggering React strict-mode warnings
 * (react-hooks/purity).
 */

import type { ChatMessage } from "@/client/components/projetos/types"

type ToolCall = NonNullable<ChatMessage["toolCalls"]>[number]

export interface BannerState {
  working: boolean
  error: { lastErrorId: string; message: string } | null
}

const ERROR_SCAN_WINDOW = 5

export function getBannerState(
  messages: ChatMessage[],
  dismissedErrorId: string | null,
): BannerState {
  return {
    working: detectWorking(messages),
    error: detectError(messages, dismissedErrorId),
  }
}

// ---------------------------------------------------------------------------
// Working detection — scan backwards, stop at the last assistant message.
// ---------------------------------------------------------------------------

function detectWorking(messages: ChatMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant") continue
    if (!msg.toolCalls || msg.toolCalls.length === 0) return false
    return msg.toolCalls.some((tc) => tc.result === undefined)
  }
  return false
}

// ---------------------------------------------------------------------------
// Error detection — scan the last N assistant messages, latest first.
// ---------------------------------------------------------------------------

function detectError(
  messages: ChatMessage[],
  dismissedErrorId: string | null,
): BannerState["error"] {
  let seen = 0
  for (let i = messages.length - 1; i >= 0 && seen < ERROR_SCAN_WINDOW; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant") continue
    seen++
    if (!msg.toolCalls) continue
    const failing = msg.toolCalls.find(isFailingToolCall)
    if (!failing) continue
    if (msg.id === dismissedErrorId) return null
    return {
      lastErrorId: msg.id,
      message: extractErrorMessage(failing.result),
    }
  }
  return null
}

function isFailingToolCall(tc: ToolCall): boolean {
  const r = tc.result
  if (typeof r !== "object" || r === null) return false
  if ("success" in r && (r as { success: unknown }).success === false)
    return true
  if ("error" in r && (r as { error: unknown }).error !== undefined)
    return true
  return false
}

function extractErrorMessage(result: unknown): string {
  if (typeof result !== "object" || result === null) return ""
  const r = result as Record<string, unknown>
  if (typeof r.error === "string") return r.error
  if (
    typeof r.error === "object" &&
    r.error !== null &&
    "message" in r.error &&
    typeof (r.error as { message: unknown }).message === "string"
  ) {
    return (r.error as { message: string }).message
  }
  if (typeof r.message === "string") return r.message
  return ""
}
