"use client"

/**
 * KnowledgeSourceList — lista as fontes da base com status de ingestão e delete.
 * Presentational; toda mutação sobe via callbacks pro KnowledgeTab.
 */

import * as React from "react"
import { FileText, Globe, Type, Trash2, Loader2, Check, AlertTriangle } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

export interface KnowledgeSource {
  id: string
  type: string
  source: string
  status: string
  error: string | null
  chunkCount: number
  createdAt: string
}

type Tokens = ReturnType<typeof useAppTokens>["tokens"]

function TypeIcon({ type }: { type: string }) {
  if (type === "url") return <Globe className="h-3.5 w-3.5" aria-hidden="true" />
  if (type === "text") return <Type className="h-3.5 w-3.5" aria-hidden="true" />
  return <FileText className="h-3.5 w-3.5" aria-hidden="true" />
}

function StatusBadge({ status, tokens }: { status: string; tokens: Tokens }) {
  const map: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    ready: { label: "Pronto", color: tokens.successText, icon: <Check className="h-3 w-3" /> },
    processing: { label: "Processando", color: tokens.textTertiary, icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    pending: { label: "Na fila", color: tokens.textTertiary, icon: <Loader2 className="h-3 w-3" /> },
    error: { label: "Erro", color: tokens.dangerText, icon: <AlertTriangle className="h-3 w-3" /> },
  }
  const s = map[status] ?? map.pending
  return (
    <span className="flex items-center gap-1 text-[11px]" style={{ color: s.color }}>
      {s.icon} {s.label}
    </span>
  )
}

export function KnowledgeSourceList({
  sources,
  onDelete,
  deletingId,
}: {
  sources: KnowledgeSource[]
  onDelete: (id: string) => void
  deletingId: string | null
}) {
  const { tokens } = useAppTokens()

  if (sources.length === 0) {
    return (
      <p className="py-6 text-center text-[12px]" style={{ color: tokens.textTertiary }}>
        Nenhuma fonte ainda. Adicione um PDF, uma URL ou cole um texto.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {sources.map((s) => (
        <li
          key={s.id}
          className="flex items-center gap-2 rounded-md border px-3 py-2"
          style={{ borderColor: tokens.border, backgroundColor: tokens.bgBase }}
        >
          <span style={{ color: tokens.textTertiary }}>
            <TypeIcon type={s.type} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px]" style={{ color: tokens.textPrimary }} title={s.source}>
              {s.source}
            </p>
            <div className="flex items-center gap-2">
              <StatusBadge status={s.status} tokens={tokens} />
              {s.status === "ready" && (
                <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
                  · {s.chunkCount} trechos
                </span>
              )}
              {s.status === "error" && s.error && (
                <span className="truncate text-[11px]" style={{ color: tokens.dangerText }} title={s.error}>
                  · {s.error}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label={`Remover ${s.source}`}
            onClick={() => onDelete(s.id)}
            disabled={deletingId === s.id}
            className="rounded p-1.5 transition-colors hover:opacity-70 disabled:opacity-40"
            style={{ color: tokens.textTertiary }}
          >
            {deletingId === s.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
