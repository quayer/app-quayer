"use client"

/**
 * DeployTab — versões prod vs draft + publish + histórico
 *
 * Tema reativo via useAppTokens. Usa shadcn AlertDialog pra confirmar
 * publish. Versions endpoint ainda não existe — stub com [].
 */

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ChevronDown, Clock, Rocket, RotateCcw } from "lucide-react"
import { Card, CardContent } from "@/client/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/client/components/ui/alert-dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/client/components/ui/collapsible"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type { WorkspaceProject } from "@/client/components/projetos/types"

interface DeployTabProps {
  project: WorkspaceProject
}

interface PromptVersion {
  id: string
  versionNumber: number
  description: string | null
  publishedAt: string | null
  createdAt: string
}

export function DeployTab({ project }: DeployTabProps) {
  const { tokens } = useAppTokens()
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    if (!project.aiAgent) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        // TODO: wire GET /api/v1/builder/projects/:id/versions
        if (!cancelled) setVersions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [project.id, project.aiAgent])

  if (!project.aiAgent) {
    return (
      <div className="mx-auto flex min-h-[280px] max-w-md flex-col items-center justify-center gap-3 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Rocket className="h-5 w-5" />
        </div>
        <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
          Aguardando o Builder criar o agente. Continue a conversa no chat.
        </p>
      </div>
    )
  }

  const published = versions.filter((v) => v.publishedAt !== null)
  const drafts = versions.filter((v) => v.publishedAt === null)
  const production = published[0] ?? null
  const draft = drafts[0] ?? null

  const handlePublish = async () => {
    if (!draft) return
    setPublishing(true)
    try {
      const res = await fetch("/api/v1/builder/projects/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          promptVersionId: draft.id,
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || `HTTP ${res.status}`)
      }
      toast.success(`Versão v${draft.versionNumber} publicada com sucesso.`)
      setConfirmOpen(false)
      setVersions((prev) =>
        prev.map((v) =>
          v.id === draft.id
            ? { ...v, publishedAt: new Date().toISOString() }
            : v,
        ),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao publicar"
      toast.error(`Falha ao publicar: ${msg}`)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {/* Header */}
      <div>
        <h2
          className="text-lg font-semibold"
          style={{ color: tokens.textPrimary }}
        >
          Publicar
        </h2>
        <p
          className="mt-0.5 text-[13px]"
          style={{ color: tokens.textSecondary }}
        >
          Gerencie versões em produção e publique novos rascunhos.
        </p>
      </div>

      {/* Status grid — prod vs draft */}
      <Card
        className="border p-0 shadow-none"
        style={{
          backgroundColor: tokens.bgSurface,
          borderColor: tokens.divider,
        }}
      >
        <CardContent className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
          <div>
            <div
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: tokens.textTertiary }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "#22c55e" }}
              />
              Produção
            </div>
            <div
              className="mt-1.5 text-xl font-bold"
              style={{ color: tokens.textPrimary }}
            >
              {production ? `v${production.versionNumber}` : "Nenhuma"}
            </div>
            {production && (
              <div
                className="mt-0.5 inline-flex items-center gap-1 text-[11px]"
                style={{ color: tokens.textTertiary }}
              >
                <Clock className="h-3 w-3" />
                {production.publishedAt
                  ? new Date(production.publishedAt).toLocaleString("pt-BR")
                  : ""}
              </div>
            )}
          </div>
          <div>
            <div
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: tokens.textTertiary }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: tokens.brand }}
              />
              Rascunho
            </div>
            <div
              className="mt-1.5 text-xl font-bold"
              style={{ color: tokens.textPrimary }}
            >
              {draft ? `v${draft.versionNumber}` : "Nenhum"}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diff collapsible */}
      <Collapsible>
        <Card
          className="border p-0 shadow-none"
          style={{
            backgroundColor: tokens.bgSurface,
            borderColor: tokens.divider,
          }}
        >
          <CollapsibleTrigger
            className="group flex w-full items-center justify-between px-4 py-3 text-[13px] font-medium"
            style={{ color: tokens.textPrimary }}
          >
            Ver diff
            <ChevronDown
              className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180"
              style={{ color: tokens.textTertiary }}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div
              className="border-t px-4 py-3 text-[13px]"
              style={{
                borderColor: tokens.divider,
                color: tokens.textSecondary,
              }}
            >
              Diff indisponível — feature pendente.
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Publish CTA */}
      <div>
        <button
          type="button"
          disabled={!draft || publishing}
          onClick={() => setConfirmOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg px-5 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          style={{
            backgroundColor: tokens.brand,
            color: tokens.textInverse,
            boxShadow:
              draft && !publishing
                ? "0 4px 14px -4px rgba(255,214,10,0.45)"
                : "none",
          }}
        >
          <Rocket className="h-3.5 w-3.5" />
          {draft ? `Publicar v${draft.versionNumber}` : "Sem rascunho"}
        </button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Publicar v{draft?.versionNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Conversas em andamento continuam com v
              {production?.versionNumber ?? "—"} até terminarem. Novas
              conversas começam na versão publicada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handlePublish()
              }}
              disabled={publishing}
            >
              {publishing ? "Publicando…" : "Publicar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Histórico */}
      <section>
        <h3
          className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: tokens.textTertiary }}
        >
          Histórico
        </h3>
        {loading ? (
          <p className="text-[13px]" style={{ color: tokens.textTertiary }}>
            Carregando…
          </p>
        ) : published.length === 0 ? (
          <p className="text-[13px]" style={{ color: tokens.textTertiary }}>
            Nenhuma versão publicada ainda.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {published.map((v) => (
              <Card
                key={v.id}
                className="border p-0 shadow-none"
                style={{
                  backgroundColor: tokens.bgSurface,
                  borderColor: tokens.divider,
                }}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[13px] font-semibold"
                      style={{ color: tokens.textPrimary }}
                    >
                      v{v.versionNumber}
                      {v.description ? ` — ${v.description}` : ""}
                    </div>
                    <div
                      className="mt-0.5 text-[11px]"
                      style={{ color: tokens.textTertiary }}
                    >
                      {v.publishedAt
                        ? new Date(v.publishedAt).toLocaleString("pt-BR")
                        : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1.5 text-[12px] opacity-50"
                    style={{ color: tokens.textTertiary }}
                    title="Restore em breve"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restaurar
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
