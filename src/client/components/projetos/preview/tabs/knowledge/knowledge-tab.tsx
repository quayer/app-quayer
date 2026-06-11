"use client"

/**
 * KnowledgeTab — Base de Conhecimento (RAG) do projeto.
 *
 * Lista fontes + status de ingestão, permite adicionar (PDF/URL/texto) e
 * ligar/desligar o uso da base pelo agente (useRAG). Quando o agente recebe uma
 * mensagem, os trechos mais relevantes são injetados no system prompt
 * automaticamente (ver knowledge-retrieval.service.ts).
 *
 * Estados do load (audit médio — erro de fetch NÃO vira empty-state mentiroso):
 *   - state=null + loadError=false → spinner (1º fetch em voo);
 *   - state=null + loadError=true  → bloco de erro honesto com "Tentar de novo"
 *     (antes, 401/500/rede viravam "Nenhuma fonte ainda" e induziam re-adicionar
 *     fontes duplicadas);
 *   - state!=null → lista normal (um reload em erro mantém a última lista boa).
 *
 * Retry de fonte com erro (audit médio): para type='url' re-postamos a MESMA URL
 * em /source/url (cria fonte nova e re-ingere) e removemos a fonte antiga com
 * erro — sem isso o usuário precisava deletar e readicionar na mão. PDF/texto
 * não têm retry aqui: o buffer/texto original não é persistido no servidor.
 */

import * as React from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type { WorkspaceProject } from "@/client/components/projetos/types"
import { KnowledgeAddSource } from "./knowledge-add-source"
import { KnowledgeSourceList, type KnowledgeSource } from "./knowledge-source-list"

interface KnowledgeState {
  collection: { id: string; name: string } | null
  sources: KnowledgeSource[]
  useRAG: boolean
}

export interface KnowledgeTabProps {
  project: WorkspaceProject
}

export function KnowledgeTab({ project }: KnowledgeTabProps) {
  const { tokens } = useAppTokens()
  const [state, setState] = React.useState<KnowledgeState | null>(null)
  const [loadError, setLoadError] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [retryingId, setRetryingId] = React.useState<string | null>(null)
  const base = `/api/v1/builder/knowledge/${project.id}`

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(base, { credentials: "same-origin" })
      if (!res.ok) {
        // Erro HTTP (sessão expirada, 500…) NÃO é "base vazia" — sinaliza erro
        // honesto em vez de renderizar o empty-state de "Nenhuma fonte ainda".
        setLoadError(true)
        return
      }
      const json = (await res.json()) as { data?: KnowledgeState }
      setState(json.data ?? { collection: null, sources: [], useRAG: false })
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [base])

  React.useEffect(() => {
    void load()
  }, [load])

  // Auto-refresh enquanto houver fonte processando (ingestão é síncrona hoje,
  // mas isto cobre o caso de migrar pra job assíncrono sem mudar a UI).
  React.useEffect(() => {
    if (!state?.sources.some((s) => s.status === "processing" || s.status === "pending")) return
    const t = setTimeout(() => void load(), 3000)
    return () => clearTimeout(t)
  }, [state, load])

  const toggleRAG = async (enabled: boolean) => {
    setState((p) => (p ? { ...p, useRAG: enabled } : p))
    try {
      const res = await fetch(base, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      // Reconcilia o estado otimista com o servidor em erro HTTP (400 sem agente,
      // 401, 404) — não só em erro de rede.
      if (!res.ok) void load()
    } catch {
      void load()
    }
  }

  const deleteSource = async (id: string) => {
    setDeletingId(id)
    try {
      await fetch(`${base}/source/${id}`, { method: "DELETE", credentials: "same-origin" })
      await load()
    } finally {
      setDeletingId(null)
    }
  }

  /**
   * Re-ingere uma fonte URL que falhou: POST da MESMA URL (cria fonte nova e
   * dispara a ingestão) e, se o servidor aceitou, remove a fonte antiga com
   * erro para a lista não duplicar. Se a nova ingestão também falhar, a fonte
   * nova aparece com o erro atualizado (substitui a antiga).
   */
  const retrySource = async (source: KnowledgeSource) => {
    if (source.type !== "url") return
    setRetryingId(source.id)
    try {
      const res = await fetch(`${base}/source/url`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: source.source }),
      })
      if (res.ok) {
        await fetch(`${base}/source/${source.id}`, {
          method: "DELETE",
          credentials: "same-origin",
        })
      }
      await load()
    } finally {
      setRetryingId(null)
    }
  }

  // ── Erro de carregamento (sem lista boa anterior) — honesto, com retry ──────
  if (!state && loadError) {
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-2xl flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center"
        style={{ borderColor: tokens.divider }}
      >
        <AlertTriangle className="h-5 w-5" style={{ color: tokens.dangerText }} />
        <p className="text-[13px] font-medium" style={{ color: tokens.textSecondary }}>
          Não foi possível carregar a base de conhecimento
        </p>
        <p className="text-[12px]" style={{ color: tokens.textTertiary }}>
          Verifique sua conexão ou tente novamente em instantes.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-1 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors hover:opacity-80"
          style={{
            borderColor: tokens.brand,
            backgroundColor: tokens.brand,
            color: "#fff",
          }}
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: tokens.textTertiary }} />
      </div>
    )
  }

  const hasAgent = Boolean(project.aiAgentId)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: tokens.textPrimary }}>
            Base de conhecimento
          </h2>
          <p className="text-[12px]" style={{ color: tokens.textTertiary }}>
            O agente consulta esses materiais ao responder (RAG).
          </p>
        </div>
        {hasAgent && (
          <label className="flex cursor-pointer items-center gap-2 text-[12px]" style={{ color: tokens.textSecondary }}>
            <input
              type="checkbox"
              checked={state.useRAG}
              onChange={(e) => void toggleRAG(e.target.checked)}
            />
            Usar no agente
          </label>
        )}
      </div>

      {/* Reload em erro com lista boa anterior: banner discreto, lista preservada. */}
      {loadError && (
        <p
          role="alert"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px]"
          style={{ backgroundColor: tokens.dangerSubtle, color: tokens.dangerText }}
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Falha ao atualizar a lista — mostrando a última versão carregada.
        </p>
      )}

      <KnowledgeAddSource projectId={project.id} onAdded={() => void load()} />

      <KnowledgeSourceList
        sources={state.sources}
        onDelete={(id) => void deleteSource(id)}
        deletingId={deletingId}
        onRetry={(source) => void retrySource(source)}
        retryingId={retryingId}
      />
    </div>
  )
}
