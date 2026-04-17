"use client"

/**
 * DeployTab — orchestrator for the 3-step publish wizard.
 *
 * Owns shared state (versions, publishing, dialog, post-publish celebration)
 * and composes: ConnectionStep (checklist), InstanceStep (publish action),
 * SummaryStep (status + timeline). Sub-components are pure presentational.
 */

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Rocket } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type { WorkspaceProject } from "@/client/components/projetos/types"
import { Skeleton } from "@/client/components/ui/skeleton"
import { ConnectionStep, useChecklist } from "./connection-step"
import { InstanceStep } from "./instance-step"
import { SummaryStep } from "./summary-step"
import { SuccessCard } from "./deploy-status-card"
import type { PromptVersion } from "./deploy-status-card"

interface DeployTabProps {
  project: WorkspaceProject
}

export function DeployTab({ project }: DeployTabProps) {
  const { tokens } = useAppTokens()
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishAsDraft, setPublishAsDraft] = useState(false)
  const [justPublished, setJustPublished] = useState<number | null>(null)

  const { checklist, metCount, allMet, unmetItems } = useChecklist(project)

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

  const handleOpenConfirm = (asDraft: boolean) => {
    setPublishAsDraft(asDraft)
    setConfirmOpen(true)
  }

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
          asDraft: publishAsDraft,
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || `HTTP ${res.status}`)
      }
      setConfirmOpen(false)

      if (publishAsDraft) {
        toast.success(`Versao v${draft.versionNumber} salva como rascunho.`)
      } else {
        setJustPublished(draft.versionNumber)
        toast.success(`Versao v${draft.versionNumber} publicada com sucesso.`)
        setVersions((prev) =>
          prev.map((v) =>
            v.id === draft.id
              ? { ...v, publishedAt: new Date().toISOString() }
              : v,
          ),
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao publicar"
      toast.error(`Falha ao publicar: ${msg}`)
    } finally {
      setPublishing(false)
      setPublishAsDraft(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
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
          Verifique os requisitos, publique versoes e gerencie o historico.
        </p>
      </div>

      <ConnectionStep
        tokens={tokens}
        checklist={checklist}
        metCount={metCount}
        allMet={allMet}
      />

      {loading ? (
        <>
          <Skeleton className="h-[120px] w-full rounded-lg" />
          <Skeleton className="h-[120px] w-full rounded-lg" />
        </>
      ) : (
        <>
          {justPublished !== null ? (
            <SuccessCard
              tokens={tokens}
              versionNumber={justPublished}
              onDismiss={() => setJustPublished(null)}
            />
          ) : (
            <InstanceStep
              tokens={tokens}
              draft={draft}
              production={production}
              publishing={publishing}
              publishAsDraft={publishAsDraft}
              confirmOpen={confirmOpen}
              allMet={allMet}
              unmetItems={unmetItems}
              onOpenConfirm={handleOpenConfirm}
              onConfirmChange={setConfirmOpen}
              onPublish={handlePublish}
            />
          )}

          <SummaryStep
            tokens={tokens}
            versions={versions}
            loading={loading}
            production={production}
            draft={draft}
            projectId={project.id}
          />
        </>
      )}
    </div>
  )
}
