/**
 * Parses numbered quick-reply lists from assistant message text.
 * Detects patterns like "Próximos passos:\n1. ...\n2. ..." and extracts
 * the items as interactive chips, returning cleaned text without the list.
 */

export interface QuickReplyChip {
  index: number
  /** Short label shown on the button */
  label: string
  /** Full message sent to sendMessage() when clicked */
  message: string
}

export interface ParsedQuickReply {
  /** Original text with the numbered list removed */
  cleanText: string
  chips: QuickReplyChip[]
}

/** Trigger phrases that precede a numbered action list */
const TRIGGER_RE =
  /(?:próximos passos|o que (?:você )?deseja|escolha uma opção|pode(?:mos)?)[^:\n]*:?\s*$/im

/** A single numbered item: "1. label" or "1) label" */
const ITEM_RE = /^\s*(\d+)[.)]\s+(.+)$/

/** Minimum number of chips to bother rendering (avoids false positives) */
const MIN_CHIPS = 2

/**
 * Returns true when a label looks like a question that needs a typed answer,
 * not a clickable action choice.
 *
 * Questions should stay as plain text in the message, not become chip buttons.
 */
function looksLikeQuestion(label: string): boolean {
  // Explicit question mark
  if (label.includes("?")) return true
  // Long labels are descriptive questions, not short action labels
  if (label.length > 55) return true
  // "Title: description" pattern — e.g. "Público-alvo: Quem são os clientes"
  if (/^[^:]{2,28}:\s+\S{3,}/.test(label)) return true
  // Starts with PT question words
  if (/^(quem|o que|qual|quais|como|quando|onde|por que|tem|há|existe|possui|quer|prefere|deseja|informe|diga|explique)\b/i.test(label)) return true
  return false
}

export function parseQuickReply(text: string): ParsedQuickReply {
  if (!text) return { cleanText: text, chips: [] }

  const lines = text.split("\n")
  let listStart = -1
  let introEnd = -1

  // Strategy 1: look for a trigger line followed by numbered items
  for (let i = 0; i < lines.length; i++) {
    if (TRIGGER_RE.test(lines[i] ?? "")) {
      // Verify that at least MIN_CHIPS numbered items follow
      let count = 0
      for (let j = i + 1; j < lines.length; j++) {
        if (ITEM_RE.test(lines[j] ?? "")) count++
        else if ((lines[j] ?? "").trim() !== "" && count > 0) break
      }
      if (count >= MIN_CHIPS) {
        introEnd = i
        listStart = i + 1
        break
      }
    }
  }

  // Strategy 2: numbered list at the end of text (no explicit trigger)
  if (listStart === -1) {
    let lastItemIdx = -1
    for (let i = lines.length - 1; i >= 0; i--) {
      if (ITEM_RE.test(lines[i] ?? "")) {
        lastItemIdx = i
      } else if ((lines[i] ?? "").trim() !== "" && lastItemIdx !== -1) {
        listStart = i + 1
        introEnd = i
        break
      }
    }
    // All lines are items
    if (listStart === -1 && lastItemIdx !== -1) {
      listStart = 0
      introEnd = -1
    }
  }

  if (listStart === -1) return { cleanText: text, chips: [] }

  // Extract chips
  const chips: QuickReplyChip[] = []
  for (let i = listStart; i < lines.length; i++) {
    const m = ITEM_RE.exec(lines[i] ?? "")
    if (m) {
      chips.push({ index: parseInt(m[1]!, 10), label: m[2]!.trim(), message: m[2]!.trim() })
    } else if ((lines[i] ?? "").trim() !== "" && chips.length > 0) {
      break
    }
  }

  if (chips.length < MIN_CHIPS) return { cleanText: text, chips: [] }

  // If the majority of items look like questions, keep them as plain text.
  const questionCount = chips.filter((c) => looksLikeQuestion(c.label)).length
  if (questionCount >= Math.ceil(chips.length * 0.5)) {
    return { cleanText: text, chips: [] }
  }

  const cleanText = lines
    .slice(0, introEnd >= 0 ? introEnd : listStart)
    .join("\n")
    .trimEnd()

  return { cleanText, chips }
}
