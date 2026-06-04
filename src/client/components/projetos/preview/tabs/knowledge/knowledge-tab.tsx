"use client"

/**
 * KnowledgeTab — Base de Conhecimento (RAG) do projeto.
 *
 * Lista fontes + status de ingestão, permite adicionar (PDF/URL/texto) e
 * ligar/desligar o uso da base pelo agente (useRAG). Quando o agente recebe uma
 * mensagem, os trechos mais relevantes são injetados no system prompt
 * automaticamente (ver knowledge-retrieval.service.ts).
 */

import * as React from "react"
import { Loader2 } from "lucide-react"
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
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const base = `/api/v1/builder/knowledge/${project.id}`

  const load = React.useCallback(async () => {
    const fallback = { collection: null, sources: [], useRAG: false }
    try {
      const res = await fetch(base, { credentials: "same-origin" })
      if (!res.ok) {
        setState(fallback)
        return
      }
      const json = (await res.json()) as { data?: KnowledgeState }
      setState(json.data ?? fallback)
    } catch {
      setState(fallback)
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

      <KnowledgeAddSource projectId={project.id} onAdded={() => void load()} />

      <KnowledgeSourceList
        sources={state.sources}
        onDelete={(id) => void deleteSource(id)}
        deletingId={deletingId}
      />
    </div>
  )
}
