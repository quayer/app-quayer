"use client"

/**
 * PromptDiff — line-by-line textual diff viewer between two prompt versions.
 *
 * Uses the `diff` library (diffLines) to produce a Myers-style line diff and
 * renders it with additive/removed/unchanged gutters in a monospaced block.
 *
 * Intended for the Deploy tab summary, e.g. comparing the currently published
 * version with the next one about to ship.
 */

import { diffLines } from "diff"
import { useMemo } from "react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

interface PromptDiffProps {
  oldContent: string
  newContent: string
  oldLabel?: string
  newLabel?: string
}

type LineKind = "added" | "removed" | "unchanged"

interface DiffLine {
  kind: LineKind
  text: string
}

const REMOVED_BG = "rgba(239,68,68,0.10)"
const REMOVED_FG = "rgb(239,68,68)"

function buildLines(oldContent: string, newContent: string): DiffLine[] {
  const parts = diffLines(oldContent, newContent)
  const lines: DiffLine[] = []

  for (const part of parts) {
    const kind: LineKind = part.added
      ? "added"
      : part.removed
        ? "removed"
        : "unchanged"

    // diffLines keeps the trailing newline in `value`; split and drop the
    // empty tail so we don't render a ghost blank line per chunk.
    const raw = part.value.replace(/\n$/, "")
    if (raw.length === 0 && part.value === "") continue
    const chunk = raw.split("\n")
    for (const text of chunk) {
      lines.push({ kind, text })
    }
  }

  return lines
}

export function PromptDiff({
  oldContent,
  newContent,
  oldLabel = "Anterior",
  newLabel = "Atual",
}: PromptDiffProps) {
  const { tokens } = useAppTokens()
  const lines = useMemo(
    () => buildLines(oldContent, newContent),
    [oldContent, newContent],
  )

  return (
    <div
      className="flex flex-col overflow-hidden rounded-md border"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <div
        className="flex items-center justify-between gap-3 border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em]"
        style={{
          borderColor: tokens.divider,
          color: tokens.textTertiary,
        }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: REMOVED_FG }}
          />
          {oldLabel}
        </span>
        <span className="flex items-center gap-1.5">
          {newLabel}
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: tokens.brand }}
          />
        </span>
      </div>

      <div
        className="overflow-auto font-mono"
        style={{
          maxHeight: 400,
          fontSize: 12,
          lineHeight: 1.5,
          color: tokens.textPrimary,
        }}
      >
        {lines.length === 0 ? (
          <div
            className="px-3 py-4 text-center text-[12px]"
            style={{ color: tokens.textTertiary }}
          >
            Sem diferencas entre as versoes.
          </div>
        ) : (
          lines.map((line, idx) => {
            const bg =
              line.kind === "added"
                ? tokens.brandSubtle
                : line.kind === "removed"
                  ? REMOVED_BG
                  : "transparent"
            const symbol =
              line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "
            const textColor =
              line.kind === "removed" ? REMOVED_FG : tokens.textPrimary

            return (
              <div
                key={`${idx}-${line.kind}`}
                className="flex gap-2 px-3 py-0.5"
                style={{ backgroundColor: bg }}
              >
                <span
                  aria-hidden
                  className="shrink-0 select-none text-right"
                  style={{
                    width: 14,
                    color:
                      line.kind === "unchanged"
                        ? tokens.textTertiary
                        : textColor,
                    opacity: line.kind === "unchanged" ? 0.5 : 1,
                  }}
                >
                  {symbol}
                </span>
                <span
                  className="min-w-0 flex-1 whitespace-pre-wrap"
                  style={{
                    color: textColor,
                    wordBreak: "break-word",
                    textDecoration:
                      line.kind === "removed" ? "line-through" : "none",
                    textDecorationColor:
                      line.kind === "removed" ? REMOVED_FG : undefined,
                  }}
                >
                  {line.text.length === 0 ? "\u00A0" : line.text}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
