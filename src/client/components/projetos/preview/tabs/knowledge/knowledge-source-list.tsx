"use client"

/**
 * KnowledgeSourceList — lista as fontes da base com status de ingestão, retry
 * (fontes URL com erro) e delete. Presentational; toda mutação sobe via
 * callbacks pro KnowledgeTab.
 *
 * Erros de ingestão chegam CRUS do backend (inglês técnico, ex. "fetch → HTTP
 * 403", "Cannot find module pdf-parse"); `friendlyIngestError` traduz para
 * PT-BR amigável antes de exibir (o erro cru fica no title p/ debug).
 */

import * as React from "react"
import { FileText, Globe, Type, Trash2, Loader2, Check, AlertTriangle, RotateCcw } from "lucide-react"
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

/**
 * Traduz a mensagem de erro técnica da ingestão para PT-BR amigável.
 * Mapeia os padrões mais comuns (HTTP do fetch, módulo ausente, timeout, DNS);
 * o que não casar cai num genérico honesto. O erro cru permanece no `title`.
 */
function friendlyIngestError(raw: string): string {
  const msg = raw.toLowerCase()
  const http = /http\s+(\d{3})/.exec(msg)
  if (http) {
    const code = http[1]
    if (code === "401" || code === "403") return "O site bloqueou o acesso à página"
    if (code === "404") return "Página não encontrada no site (404)"
    if (code.startsWith("5")) return `O site está com problema (HTTP ${code})`
    return `O site respondeu com erro (HTTP ${code})`
  }
  if (msg.includes("cannot find module") || msg.includes("module_not_found")) {
    return "Falha interna ao processar o arquivo — tente novamente mais tarde"
  }
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("aborted")) {
    return "Tempo esgotado ao acessar a fonte"
  }
  if (
    msg.includes("fetch failed") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("network")
  ) {
    return "Não foi possível acessar o endereço"
  }
  if (msg.includes("empty") || msg.includes("no text") || msg.includes("sem texto")) {
    return "Não encontramos texto aproveitável na fonte"
  }
  return "Falha ao processar a fonte"
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
  onRetry,
  retryingId,
}: {
  sources: KnowledgeSource[]
  onDelete: (id: string) => void
  deletingId: string | null
  /** Re-ingere uma fonte URL com erro (o tab re-posta a mesma URL). */
  onRetry: (source: KnowledgeSource) => void
  retryingId: string | null
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
      {sources.map((s) => {
        const busy = deletingId === s.id || retryingId === s.id
        // Retry só para URL: o backend re-ingere a partir da própria URL; PDF e
        // texto precisariam do buffer/texto original, que não fica persistido.
        const canRetry = s.status === "error" && s.type === "url"
        return (
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
                <StatusBadge status={retryingId === s.id ? "processing" : s.status} tokens={tokens} />
                {s.status === "ready" && (
                  <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
                    · {s.chunkCount} trechos
                  </span>
                )}
                {s.status === "error" && s.error && retryingId !== s.id && (
                  <span className="truncate text-[11px]" style={{ color: tokens.dangerText }} title={s.error}>
                    · {friendlyIngestError(s.error)}
                  </span>
                )}
              </div>
            </div>
            {canRetry && (
              <button
                type="button"
                aria-label={`Tentar de novo ${s.source}`}
                title="Tentar de novo"
                onClick={() => onRetry(s)}
                disabled={busy}
                className="rounded p-1.5 transition-colors hover:opacity-70 disabled:opacity-40"
                style={{ color: tokens.textSecondary }}
              >
                {retryingId === s.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <button
              type="button"
              aria-label={`Remover ${s.source}`}
              onClick={() => onDelete(s.id)}
              disabled={busy}
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
        )
      })}
    </ul>
  )
}
