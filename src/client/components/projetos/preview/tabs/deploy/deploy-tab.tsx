"use client"

/**
 * DeployTab — orchestrator for the publish wizard.
 *
 * Step 1: ChannelPickerSection — pick/create/connect a WhatsApp channel.
 * Step 2: ConnectionStep        — readiness checklist (step-engine blockers).
 * Step 3: InstanceStep          — publish version action (gated by readiness).
 * Step 4: SummaryStep           — version history + rollback.
 *
 * Fontes únicas:
 *  - canal:     query ["project-channel", id] com poll contínuo enquanto o
 *               canal existe mas não conectou (para só em CONNECTED);
 *  - requisitos: GET /builder/projects/:id/readiness (mesma fonte da Overview);
 *  - versões:   query ["project-versions", id] — invalidada pós-publish/rollback
 *               e compartilhada por prop com Instance/SummaryStep.
 */

import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Rocket } from "lucide-react"
import { api } from "@/igniter.client"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { WorkspaceProject } from "@/client/components/projetos/types"
import { Button } from "@/client/components/ui/button"
import { Card, CardContent } from "@/client/components/ui/card"
import { Skeleton } from "@/client/components/ui/skeleton"
import { unwrapReadiness } from "../overview/helpers/readiness-adapters"
import { ConnectionStep, deriveChecklist } from "./connection-step"
import type { ChecklistItem } from "./connection-step"
import { InstanceStep } from "./instance-step"
import { SummaryStep } from "./summary-step"
import { SuccessCard } from "./deploy-status-card"
import { ChannelPickerSection } from "./channel-picker-section"
import { readErrorMessage } from "./read-error-message"
import { readinessToChecklist } from "./readiness-checklist"
import { unwrapVersions } from "./version-utils"
import type { VersionListItem } from "./version-utils"

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
    provider?: string
    profileName?: string | null
  } | null
}

const CONNECTED_CHANNEL_STATUSES = new Set(["CONNECTED", "ACTIVE", "READY"])

function unwrapProjectChannel(value: unknown): ProjectChannelResponse {
  if (
    value &&
    typeof value === "object" &&
    "channel" in value
  ) {
    return value as ProjectChannelResponse
  }

  if (value && typeof value === "object" && "data" in value) {
    return unwrapProjectChannel((value as { data: unknown }).data)
  }

  return { channel: null }
}

function StepIndicator({ step, tokens }: { step: 1 | 2 | 3 | 4; tokens: AppTokens }) {
  const steps = ["Canal", "Requisitos", "Publicar", "Histórico"]
  return (
    <div
      className="flex items-center gap-0"
      role="group"
      aria-label="Progresso da publicação"
    >
      {steps.map((label, i) => {
        const n = i + 1
        const done = n < step
        const active = n === step
        return (
          <React.Fragment key={label}>
            <div
              className="flex flex-col items-center gap-1"
              aria-current={active ? "step" : undefined}
            >
              <div
                aria-hidden="true"
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
                <span className="sr-only">
                  {done ? " (concluído)" : active ? " (etapa atual)" : ""}
                </span>
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

function RetryCard({
  tokens,
  message,
  retrying,
  onRetry,
}: {
  tokens: AppTokens
  message: string
  retrying: boolean
  onRetry: () => void
}) {
  return (
    <Card
      className="border p-0 shadow-none"
      style={{ backgroundColor: tokens.bgSurface, borderColor: tokens.danger }}
    >
      <CardContent className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p role="alert" className="text-[12px]" style={{ color: tokens.dangerText }}>
          {message}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? "Carregando..." : "Tentar novamente"}
        </Button>
      </CardContent>
    </Card>
  )
}

export function DeployTab({ project }: DeployTabProps) {
  const { tokens } = useAppTokens()
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishAsDraft, setPublishAsDraft] = useState(false)
  const [justPublished, setJustPublished] = useState<number | null>(null)

  // ── Active channel query ────────────────────────────────────────────────────
  // Poll the current channel attached to this project's agent so the checklist
  // stays in sync without a full page reload. While a channel exists but has
  // NOT connected (aguardando scan do QR), keep polling fast; stop only when
  // it reaches a connected status.
  const channelQuery = useQuery<ProjectChannelResponse>({
    queryKey: ["project-channel", project.id],
    queryFn: async () => {
      const response = await fetch(`/api/v1/builder/projects/${project.id}/channel`, {
        credentials: "same-origin",
      })

      if (!response.ok) {
        throw new Error(`Erro ${response.status} ao carregar canal vinculado`)
      }

      return unwrapProjectChannel(await response.json())
    },
    enabled: !!project.aiAgent,
    staleTime: 0,
    refetchInterval: (query) => {
      const channel = (query.state.data as ProjectChannelResponse | undefined)?.channel
      if (!channel) return 15_000
      return CONNECTED_CHANNEL_STATUSES.has(channel.status.toUpperCase())
        ? false
        : 5_000
    },
  })
  const channelLoading = channelQuery.isLoading

  const projectChannel = channelQuery.data?.channel ?? null
  // Fallback SSR (project.hasWhatsAppConnection) APENAS enquanto a query não
  // respondeu — quando ela responde channel:null (ex.: pós-desvincular), o
  // valor SSR está stale e o correto é false.
  const hasConnectedChannel = projectChannel
    ? CONNECTED_CHANNEL_STATUSES.has(projectChannel.status.toUpperCase())
    : channelLoading
      ? project.hasWhatsAppConnection
      : false

  // ── Readiness (step-engine) ─────────────────────────────────────────────────
  // Mesma fonte da Overview: blockers tipados plan/byok/agent/prompt/version/
  // channel. Substitui a heurística local que ignorava plano/BYOK/versão.
  const readinessQuery = api.builder.getReadiness.useQuery({
    params: { id: project.id },
  })
  const readiness = useMemo(
    () => unwrapReadiness(readinessQuery.data),
    [readinessQuery.data],
  )

  const refetchReadinessRef = useRef(readinessQuery.refetch)
  useEffect(() => {
    refetchReadinessRef.current = readinessQuery.refetch
  }, [readinessQuery.refetch])

  // Re-sincroniza o readiness quando o status do canal muda (ex.: QR escaneado
  // → CONNECTED) para o blocker de canal limpar sem F5.
  const channelStatus = projectChannel?.status ?? null
  const prevChannelStatusRef = useRef(channelStatus)
  useEffect(() => {
    if (prevChannelStatusRef.current === channelStatus) return
    prevChannelStatusRef.current = channelStatus
    void refetchReadinessRef.current()
  }, [channelStatus])

  // Build a derived project that reflects the live channel state — usado só
  // como FALLBACK do checklist enquanto o readiness não respondeu.
  const liveProject = useMemo<WorkspaceProject>(
    () => ({ ...project, hasWhatsAppConnection: hasConnectedChannel }),
    [project, hasConnectedChannel],
  )

  const checklist = useMemo<ChecklistItem[]>(
    () => (readiness ? readinessToChecklist(readiness) : deriveChecklist(liveProject)),
    [readiness, liveProject],
  )
  const metCount = useMemo(() => checklist.filter((c) => c.met).length, [checklist])
  const allMet = metCount === checklist.length
  const unmetItems = useMemo(() => checklist.filter((c) => !c.met), [checklist])

  // ── Versions (fonte única) ──────────────────────────────────────────────────
  const versionsQuery = useQuery<VersionListItem[]>({
    queryKey: ["project-versions", project.id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/builder/projects/${project.id}/versions`, {
        credentials: "same-origin",
      })
      if (!res.ok) throw new Error(`Erro ${res.status} ao carregar versões`)
      return unwrapVersions(await res.json())
    },
    enabled: !!project.aiAgent,
  })
  const versions = useMemo(() => versionsQuery.data ?? [], [versionsQuery.data])
  const loading = versionsQuery.isLoading

  const handleVersionsChanged = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["project-versions", project.id] })
    void refetchReadinessRef.current()
  }, [queryClient, project.id])

  const onChannelAttached = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["project-channel", project.id] })
    await queryClient.invalidateQueries({ queryKey: ["project-channel-options", project.id] })
    void refetchReadinessRef.current()
  }, [queryClient, project.id])

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

  // Determine current wizard step for the StepIndicator, na ordem real da
  // jornada: sem canal → 1; canal sem requisitos completos → 2; pronto para
  // publicar → 3; em produção → 4.
  const currentStep: 1 | 2 | 3 | 4 = (() => {
    if (production !== null) return 4
    if (projectChannel === null) return 1
    if (hasConnectedChannel && allMet && draft !== null) return 3
    return 2
  })()

  const handleOpenConfirm = (asDraft: boolean) => {
    setPublishAsDraft(asDraft)
    setConfirmOpen(true)
  }

  const handlePublish = async () => {
    if (!draft || publishing) return
    setPublishing(true)
    try {
      // "Manter como rascunho" é um no-op de servidor: a versão já existe como
      // rascunho (publishedAt === null). Só confirma na UI.
      if (publishAsDraft) {
        setConfirmOpen(false)
        toast.success(`Versão v${draft.versionNumber} mantida como rascunho.`)
        return
      }

      // Rota real da saga (a antiga /projects/publish não existe → era 404).
      const res = await fetch("/api/v1/builder/deploy/publish-version", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          promptVersionId: draft.id,
        }),
      })
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, `Erro ${res.status} ao publicar`))
      }
      setConfirmOpen(false)
      setJustPublished(draft.versionNumber)
      toast.success(`Versão v${draft.versionNumber} publicada com sucesso.`)
      // Invalida a fonte única — resumo, diff e timeline atualizam juntos.
      await handleVersionsChanged()
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
          Conecte um canal, verifique os requisitos e publique versões do seu agente.
        </p>
      </div>

      <StepIndicator step={currentStep} tokens={tokens} />

      {/* Step 1 — channel picker */}
      {channelQuery.isError ? (
        <RetryCard
          tokens={tokens}
          message="Não foi possível carregar o canal vinculado ao projeto."
          retrying={channelQuery.isFetching}
          onRetry={() => void channelQuery.refetch()}
        />
      ) : (
        <ChannelPickerSection
          tokens={tokens}
          projectId={project.id}
          projectChannel={projectChannel}
          channelLoading={channelLoading}
          onChannelAttached={onChannelAttached}
        />
      )}

      {/* Step 2 — readiness checklist */}
      <ConnectionStep
        tokens={tokens}
        checklist={checklist}
        metCount={metCount}
        allMet={allMet}
      />

      {/* Steps 3 + 4 — publish + history */}
      {versionsQuery.isError ? (
        <RetryCard
          tokens={tokens}
          message="Não foi possível carregar as versões do agente."
          retrying={versionsQuery.isFetching}
          onRetry={() => void versionsQuery.refetch()}
        />
      ) : loading ? (
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
            onVersionsChanged={handleVersionsChanged}
          />
        </>
      )}
    </div>
  )
}
