"use client"

import * as React from "react"
import { AlertTriangle, Pencil } from "lucide-react"

import type { CardComponentProps } from "../types"

export type ReviewBlockId = "voice" | "scope" | "team" | "presentation"

export function ReviewBlock({
  id,
  title,
  summary,
  error,
  editing,
  disabled,
  tokens,
  onToggle,
  children,
}: {
  id: ReviewBlockId
  title: string
  summary: string[]
  error?: string
  editing: boolean
  disabled: boolean
  tokens: CardComponentProps["tokens"]
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section
      className="border-t py-3 first:border-t-0 first:pt-0 last:pb-0"
      style={{ borderColor: tokens.divider }}
      aria-labelledby={`agent-review-${id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            id={`agent-review-${id}`}
            className="text-[12px] font-semibold uppercase tracking-wide"
            style={{ color: tokens.textTertiary }}
          >
            {title}
          </h3>
          <div className="mt-1 flex flex-col gap-0.5">
            {summary.map((line) => (
              <p
                key={line}
                className="break-words text-[13px] leading-relaxed"
                style={{ color: tokens.textPrimary }}
              >
                {line}
              </p>
            ))}
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: editing ? tokens.brand : tokens.divider,
            color: editing ? tokens.brandText : tokens.textSecondary,
            backgroundColor: editing ? tokens.brandSubtle : tokens.bgBase,
          }}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          {editing ? "Fechar" : "Editar"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed"
          style={{ color: tokens.dangerText }}
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          {error}
        </p>
      )}

      <div className={editing ? "mt-3" : "hidden"} aria-hidden={!editing}>
        {children}
      </div>
    </section>
  )
}
