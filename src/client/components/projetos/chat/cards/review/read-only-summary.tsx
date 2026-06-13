"use client"

/**
 * Builder Cards — review/read-only-summary (FR-53 · revisão final orientada a negócio)
 *
 * RETRATO somente-leitura do pacote do agente, em linguagem de negócio (FR-49),
 * renderizado no topo do card `agent_review` ANTES dos blocos editáveis. NÃO é uma
 * re-decisão: zero toggles/inputs que gravem — só exibe o que `buildReadOnlySections`
 * derivou do `value` (BuilderState). Seções sem itens não são renderizadas.
 *
 * Token-driven (zero cor hard-coded). Sem estado, sem I/O.
 */

import * as React from "react"
import { ShieldAlert } from "lucide-react"

import type { CardComponentProps } from "../types"
import { buildReadOnlySections } from "./read-only-summary.logic"

export function ReadOnlySummary({
  value,
  tokens,
}: {
  value: CardComponentProps["value"]
  tokens: CardComponentProps["tokens"]
}) {
  const sections = React.useMemo(() => buildReadOnlySections(value), [value])

  if (sections.length === 0) return null

  return (
    <div
      className="mb-1 flex flex-col gap-3 rounded-lg border p-3"
      style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}
      aria-label="Resumo do agente"
    >
      {sections.map((section) => {
        const isNeverPromise = section.id === "never-promise"
        return (
          <section key={section.id} aria-labelledby={`agent-review-ro-${section.id}`}>
            <h3
              id={`agent-review-ro-${section.id}`}
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
              style={{
                color: isNeverPromise ? tokens.warningText : tokens.textTertiary,
              }}
            >
              {isNeverPromise ? (
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              ) : null}
              {section.title}
            </h3>
            <ul className="mt-1 flex flex-col gap-0.5">
              {section.items.map((item) => (
                <li
                  key={item}
                  className="break-words text-[13px] leading-relaxed"
                  style={{
                    color: isNeverPromise
                      ? tokens.warningText
                      : tokens.textPrimary,
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export default ReadOnlySummary
