"use client"

import * as React from "react"
import { AlertTriangle, Info, TriangleAlert, Wrench } from "lucide-react"

import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

/**
 * Tier 3.5 — distinguish 3 "unsuccessful" cases so the user gets the right
 * affect: red = real error (exception), amber = expected validation failure
 * (user must correct input), gray = neutral "no-op / dry-run / nothing to
 * show" that should NOT trigger alarm.
 *
 * Classification is inferred from well-known payload fields:
 *   - `code` matching validation patterns → "validation"
 *   - payload `kind: 'empty' | 'noop'` or empty data → "empty"
 *   - default → "error"
 */
type ErrorKind = "error" | "validation" | "empty"

const VALIDATION_CODE_HINTS = [
  "VALIDATION",
  "INVALID",
  "MISSING",
  "REQUIRED",
  "FORMAT",
  "CONFLICT",
  "NOT_UNIQUE",
  "ALREADY_EXISTS",
]

function classifyErrorKind(result: unknown, messageHint: string): ErrorKind {
  if (!result || typeof result !== "object") return "error"
  const r = result as Record<string, unknown>
  const kind = typeof r.kind === "string" ? r.kind.toLowerCase() : ""
  if (kind === "empty" || kind === "noop" || kind === "dry_run") return "empty"
  const code = typeof r.code === "string" ? r.code.toUpperCase() : ""
  if (code && VALIDATION_CODE_HINTS.some((hint) => code.includes(hint))) {
    return "validation"
  }
  if (
    /campo obrigat[oó]rio|valor inv[aá]lido|formato inv[aá]lido|preencha/i.test(
      messageHint,
    )
  ) {
    return "validation"
  }
  return "error"
}

const KIND_THEME: Record<
  ErrorKind,
  {
    borderColor: string
    bgColor: string
    iconColor: string
    label: string
    Icon: typeof AlertTriangle
  }
> = {
  error: {
    borderColor: "rgba(239,68,68,0.30)",
    bgColor: "rgba(239,68,68,0.08)",
    iconColor: "#ef4444",
    label: "Erro em",
    Icon: AlertTriangle,
  },
  validation: {
    borderColor: "rgba(234,179,8,0.35)",
    bgColor: "rgba(234,179,8,0.10)",
    iconColor: "#b45309",
    label: "Revise os dados em",
    Icon: TriangleAlert,
  },
  empty: {
    borderColor: "rgba(148,163,184,0.30)",
    bgColor: "rgba(148,163,184,0.10)",
    iconColor: "#64748b",
    label: "Sem resultado em",
    Icon: Info,
  },
}

/**
 * GenericErrorCard — renders when any tool returns `success: false` and
 * no specialized error renderer matches. Tier 3.5: auto-classifies the
 * payload into error/validation/empty and themes accordingly.
 */
export function GenericErrorCard({
  toolName,
  message,
  result,
  tokens,
}: {
  toolName: string
  message: string
  result?: unknown
  tokens: AppTokens
}) {
  const kind = classifyErrorKind(result, message)
  const theme = KIND_THEME[kind]
  const Icon = theme.Icon

  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: theme.borderColor,
        borderRadius: "16px",
      }}
    >
      <CardContent className="flex items-center gap-3 px-4 py-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: theme.bgColor,
            color: theme.iconColor,
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[13px] font-medium"
            style={{ color: tokens.textPrimary }}
          >
            {theme.label}{" "}
            <span
              className="font-mono"
              style={{ color: tokens.textSecondary }}
            >
              {toolName}
            </span>
          </p>
          <p
            className="mt-0.5 text-[12px]"
            style={{ color: tokens.textSecondary }}
          >
            {message}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * FallbackResultCard — used when no tool-specific renderer matches.
 * Shows a pretty-printed JSON view of args + result.
 */
export function FallbackResultCard({
  toolName,
  args,
  result,
  tokens,
}: {
  toolName: string
  args: unknown
  result: unknown
  tokens: AppTokens
}) {
  const prettyJson = (v: unknown) => {
    try {
      return JSON.stringify(v, null, 2)
    } catch {
      return String(v)
    }
  }

  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
        borderRadius: "16px",
      }}
    >
      <CardContent className="p-0">
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ backgroundColor: tokens.hoverBg }}
        >
          <Wrench className="h-3.5 w-3.5" style={{ color: tokens.brand }} />
          <span
            className="font-mono text-[12px] font-medium"
            style={{ color: tokens.textPrimary }}
          >
            {toolName}
          </span>
          {result !== undefined && (
            <span
              className="ml-auto text-[11px]"
              style={{ color: tokens.textTertiary }}
            >
              concluido
            </span>
          )}
        </div>
        <div className="px-4 py-3">
          {args !== undefined &&
            Object.keys(args as Record<string, unknown>).length > 0 && (
              <>
                <p
                  className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: tokens.textTertiary }}
                >
                  Argumentos
                </p>
                <pre
                  className="whitespace-pre-wrap break-words rounded-lg p-2.5 text-[11px]"
                  style={{
                    backgroundColor: tokens.bgBase,
                    color: tokens.textSecondary,
                  }}
                >
                  {prettyJson(args)}
                </pre>
              </>
            )}
          {result !== undefined && (
            <>
              <p
                className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: tokens.textTertiary }}
              >
                Resultado
              </p>
              <pre
                className="whitespace-pre-wrap break-words rounded-lg p-2.5 text-[11px]"
                style={{
                  backgroundColor: tokens.bgBase,
                  color: tokens.textSecondary,
                }}
              >
                {prettyJson(result)}
              </pre>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
