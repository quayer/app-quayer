"use client"

/**
 * DeployTab — orchestrator for the publish wizard.
 *
 * Step 1: ChannelPickerSection — pick/create/connect a WhatsApp channel.
 * Step 2: ConnectionStep        — readiness checklist.
 * Step 3: InstanceStep          — publish version action.
 * Step 4: SummaryStep           — version history + rollback.
 */

import * as React from "react"
import { useEffect, useState, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Rocket } from "lucide-react"
import { api } from "@/igniter.client"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { WorkspaceProject } from "@/client/components/projetos/types"
import { Skeleton } from "@/client/components/ui/skeleton"
import { ConnectionStep, useChecklist } from "./connection-step"
import { InstanceStep } from "./instance-step"
import { SummaryStep } from "./summary-step"
import { SuccessCard } from "./deploy-status-card"
import { ChannelPickerSection } from "./channel-picker-section"
import type { PromptVersion } from "./deploy-status-card"

interface DeployTabProps {
  project: WorkspaceProject
}

// Shape returned by GET /projects/:id/channel
interface ProjectChannelResponse {
  channel: {
    id: string
    name: string
    phoneNumber: string | null
    status: string
  } | null
}

function StepIndicator({ step, tokens }: { step: 1 | 2 | 3 | 4; tokens: AppTokens }) {
  const steps = ["Canal", "Requisitos", "Publicar", "Histórico"]
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const n = i + 1
        const done = n < step
        const active = n === step
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  backgroundColor: done || active ? tokens.brand : tokens.hoverBg,
                  color: done || active ? tokens.textInverse : tokens.textTertiary,
                }}
              >
                {done ? "✓" : n}
              </div>
              <span className="text-[10px]" style={{ color: active ? tokens.brand : tokens.textTertiary }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="mb-4 h-[1px] flex-1 mx-1"
                style={{ backgroundColor: done ? tokens.brand : tokens.divider }}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function DeployTab({ project }: DeployTabProps) {
  const { tokens } = useAppTokens()
  const queryClient = useQueryClient()
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishAsDraft, setPublishAsDraft] = useState(false)
  const [justPublished, setJustPublished] = useState<number | null>(null)

  // ── Active channel query ────────────────────────────────────────────────────
  // Poll the current channel attached to this project's agent so the
  // checklist item stays in sync without a full page reload.
  // Stop polling once a channel is connected (data?.channel !== null).
  const { data: channelData, isLoading: channelLoading } = useQuery<ProjectChannelResponse>({
    queryKey: ["project-channel", project.id],
    queryFn: async () => {
      const res = await api.builder.getProjectChannel.query({
        params: { id: project.id },
      })
      return (res?.data ?? { channel: null }) as ProjectChannelResponse
    },
    enabled: !!project.aiAgent,
    staleTime: 0,
    refetchInterval: (query) =>
      (query.state.data as ProjectChannelResponse | undefined)?.channel != null ? false : 15_000,
  })

  const projectChannel = channelData?.channel ?? null

  // Build a derived project that reflects the live channel state so the
  // checklist doesn't depend on a SSR-only hasWhatsAppConnection boolean.
  const liveProject: WorkspaceProject = {
    ...project,
    hasWhatsAppConnection: project.hasWhatsAppConnection || projectChannel !== null,
  }

  const { checklist, metCount, allMet, unmetItems } = useChecklist(liveProject)

  // ── Versions loader ─────────────────────────────────────────────────────────
  // Extracted into a named callback so it can be called imperatively after
  // a successful publish (Problem 2 fix).
  const loadVersions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/v1/builder/projects/${project.id}/versions`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { data?: { versions?: PromptVersion[] } }
      setVersions(json.data?.versions ?? [])
    } catch {
      // Silently fall back to empty — SummaryStep trata o estado vazio
      setVersions([])
    } finally {
      setLoading(false)
    }
  }, [project.id])

  useEffect(() => {
    if (!project.aiAgent) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/v1/builder/projects/${project.id}/versions`,
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data?: { versions?: PromptVersion[] } }
        if (!cancelled) setVersions(json.data?.versions ?? [])
      } catch {
        // Silently fall back to empty — SummaryStep trata o estado vazio
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

  // Determine current wizard step for the StepIndicator
  const currentStep: 1 | 2 | 3 | 4 = (() => {
    if (production !== null) return 4
    if (allMet || draft !== null) return 3
    if (projectChannel !== null) return 2
    return 1
  })()

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
        // Re-fetch versions from server instead of optimistic update
        await loadVersions()
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
          Conecte um canal, verifique os requisitos e publique versoes do seu agente.
        </p>
      </div>

      <StepIndicator step={currentStep} tokens={tokens} />

      {/* Step 1 — channel picker */}
      <ChannelPickerSection
        tokens={tokens}
        projectId={project.id}
        projectChannel={projectChannel}
        channelLoading={channelLoading}
        onChannelAttached={() =>
          queryClient.invalidateQueries({ queryKey: ["project-channel", project.id] })
        }
      />

      {/* Step 2 — readiness checklist */}
      <ConnectionStep
        tokens={tokens}
        checklist={checklist}
        metCount={metCount}
        allMet={allMet}
      />

      {/* Steps 3 + 4 — publish + history */}
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
