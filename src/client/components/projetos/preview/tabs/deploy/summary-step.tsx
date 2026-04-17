"use client"

/**
 * SummaryStep — version status cards + history timeline (step 3)
 *
 * Displays production/draft status (via VersionStatusCards) plus a
 * collapsible chronological list of every PromptVersion.
 *
 * Pulls the real version history from `api.builder.listVersions` so the
 * "Ver diff" action can surface the content delta between the upcoming
 * version and the one currently live in production.
 */

import { ChevronDown, Circle, GitCompare, RotateCcw } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { api } from "@/igniter.client"
import { Card, CardContent } from "@/client/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/client/components/ui/collapsible"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog"
import { AskBuilderButton } from "../../shared/ask-builder-button"
import { TimelineDot, VersionStatusCards } from "./deploy-status-card"
import type { PromptVersion, Tokens } from "./deploy-status-card"
import { PromptDiff } from "./prompt-diff"

/**
 * Full version shape returned by `GET /api/v1/builder/projects/:id/versions`.
 * Matches the server contract — kept local to avoid a cross-tab export.
 */
interface VersionListItem {
  id: string
  versionNumber: number
  content: string
  description: string | null
  createdBy: "chat" | "manual" | "rollback"
  publishedAt: string | null
  publishedBy: { id: string; name: string } | null
  createdAt: string
}

interface ListVersionsClient {
  useQuery: (args: { params: { id: string } }) => {
    data?: { versions: VersionListItem[] } | null
    isLoading: boolean
  }
}

interface RollbackPromptClient {
  mutate: (
    args: { params: { id: string }; body: { targetVersionId: string } },
    options: {
      onSuccess: (data: { versionNumber: number }) => void
      onError: (err: unknown) => void
    },
  ) => void
  isPending: boolean
}

function VersionTimelineEntry({
  version,
  tokens,
  isLast,
}: {
  version: PromptVersion
  tokens: Tokens
  isLast: boolean
}) {
  const isPublished = version.publishedAt !== null
  const dotColor = isPublished ? "#22c55e" : tokens.brand

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <TimelineDot color={dotColor} />
        {!isLast && (
          <div
            className="w-px flex-1"
            style={{ backgroundColor: tokens.divider, minHeight: 32 }}
          />
        )}
      </div>

      <div className="flex flex-1 items-start justify-between pb-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="text-[13px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              v{version.versionNumber}
            </span>
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: isPublished
                  ? "rgba(34,197,94,0.12)"
                  : `${tokens.brand}18`,
                color: isPublished ? "#22c55e" : tokens.brand,
              }}
            >
              {isPublished ? "Publicado" : "Rascunho"}
            </span>
          </div>
          {version.description && (
            <p
              className="mt-0.5 text-[12px]"
              style={{ color: tokens.textSecondary }}
            >
              {version.description}
            </p>
          )}
          <p
            className="mt-0.5 text-[11px]"
            style={{ color: tokens.textTertiary }}
          >
            {version.publishedAt
              ? new Date(version.publishedAt).toLocaleString("pt-BR")
              : new Date(version.createdAt).toLocaleString("pt-BR")}
          </p>
        </div>

        {isPublished && (
          <button
            type="button"
            disabled
            className="ml-3 inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium opacity-50 transition-opacity"
            style={{
              color: tokens.textTertiary,
              backgroundColor: tokens.hoverBg,
            }}
            title="Restaurar versao (em breve)"
          >
            <RotateCcw className="h-3 w-3" />
            Restaurar
          </button>
        )}
      </div>
    </div>
  )
}

interface SummaryStepProps {
  tokens: Tokens
  versions: PromptVersion[]
  loading: boolean
  production: PromptVersion | null
  draft: PromptVersion | null
  projectId: string
}

export function SummaryStep({
  tokens,
  versions,
  loading,
  production,
  draft,
  projectId,
}: SummaryStepProps) {
  const [diffOpen, setDiffOpen] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)

  const listVersions = api.builder.listVersions as unknown as ListVersionsClient
  const { data: versionsData, isLoading: versionsLoading } = listVersions.useQuery({
    params: { id: projectId },
  })

  const rollbackPrompt = api.builder.rollbackPrompt as unknown as RollbackPromptClient

  const fullVersions = useMemo<VersionListItem[]>(() => {
    const rows = versionsData?.versions ?? []
    return [...rows].sort((a, b) => b.versionNumber - a.versionNumber)
  }, [versionsData])

  const newest = fullVersions[0] ?? null
  // The version currently live in prod = the most recent published one that
  // is not the very newest (so we can offer reverting to it).
  const prodVersion =
    fullVersions.find((v) => v.publishedAt !== null) ?? null
  // A previous prod version exists only when newest itself is published AND
  // there is an older published version, OR when newest is unpublished and
  // prodVersion exists as the live one.
  // For rollback we need: we have at least one published version AND there
  // is an older published version to go back to.
  const prevProdVersion = useMemo<VersionListItem | null>(() => {
    const published = fullVersions.filter((v) => v.publishedAt !== null)
    // published[0] is the latest published, published[1] is the one before it
    return published.length >= 2 ? (published[1] ?? null) : null
  }, [fullVersions])

  // Show rollback when the current prod version is not null and there's a
  // previous published version to revert to.
  const canRollback =
    newest !== null &&
    newest.publishedAt !== null &&
    prevProdVersion !== null

  const canShowDiff =
    newest !== null && prodVersion !== null && newest.id !== prodVersion.id

  const allVersionsSorted = [...versions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  )

  const isLoading = loading || versionsLoading

  function handleRollbackConfirm() {
    if (!prevProdVersion) return
    rollbackPrompt.mutate(
      { params: { id: projectId }, body: { targetVersionId: prevProdVersion.id } },
      {
        onSuccess: (data) => {
          toast.success(`Revertido para v${prevProdVersion.versionNumber} (nova versão v${data.versionNumber})`)
          setRollbackOpen(false)
          // TODO: substituir por queryClient.invalidateQueries quando cast suportar
          window.location.reload()
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Erro ao reverter'
          toast.error(msg)
          setRollbackOpen(false)
        },
      },
    )
  }

  return (
    <>
      <VersionStatusCards
        tokens={tokens}
        versions={versions}
        loading={loading}
        production={production}
        draft={draft}
      />

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: tokens.textTertiary }}
          >
            Resumo da publicacao
          </h3>
          <div className="flex items-center gap-2">
            <AskBuilderButton
              tokens={tokens}
              variant="small"
              message="Estou pronto para publicar. Ha algo que voce recomendaria ajustar antes?"
            />
            {canRollback && prevProdVersion && (
              <button
                type="button"
                disabled={rollbackPrompt.isPending}
                onClick={() => setRollbackOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50"
                style={{
                  borderColor: tokens.divider,
                  color: tokens.textPrimary,
                  backgroundColor: tokens.bgSurface,
                }}
              >
                <RotateCcw className="h-3 w-3" />
                Reverter para v{prevProdVersion.versionNumber}
              </button>
            )}
            {canShowDiff && newest && prodVersion && (
              <button
                type="button"
                onClick={() => setDiffOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors"
                style={{
                  borderColor: tokens.divider,
                  color: tokens.textPrimary,
                  backgroundColor: tokens.bgSurface,
                }}
              >
                <GitCompare className="h-3 w-3" />
                Ver diff
              </button>
            )}
          </div>
        </div>

        {versionsLoading ? (
          <div
            className="h-16 w-full animate-pulse rounded-md"
            style={{ backgroundColor: tokens.hoverBg }}
          />
        ) : newest ? (
          <div
            className="rounded-md border p-3 text-[12px]"
            style={{
              borderColor: tokens.divider,
              backgroundColor: tokens.bgSurface,
              color: tokens.textSecondary,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <span style={{ color: tokens.textTertiary }}>
                Versao a publicar
              </span>
              <span
                className="font-semibold"
                style={{ color: tokens.textPrimary }}
              >
                v{newest.versionNumber}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <span style={{ color: tokens.textTertiary }}>
                Versao atual em producao
              </span>
              <span
                className="font-semibold"
                style={{ color: tokens.textPrimary }}
              >
                {prodVersion
                  ? `v${prodVersion.versionNumber}`
                  : "Sera a primeira versao publicada"}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      <section>
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="group mb-3 flex w-full items-center justify-between">
            <h3
              className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: tokens.textTertiary }}
            >
              Historico de versoes
            </h3>
            <ChevronDown
              className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180"
              style={{ color: tokens.textTertiary }}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {isLoading ? (
              <div className="flex items-center gap-2 py-4">
                <div
                  className="h-3 w-3 animate-spin rounded-full border-2 border-t-transparent"
                  style={{
                    borderColor: tokens.textTertiary,
                    borderTopColor: "transparent",
                  }}
                />
                <p
                  className="text-[13px]"
                  style={{ color: tokens.textTertiary }}
                >
                  Carregando...
                </p>
              </div>
            ) : allVersionsSorted.length === 0 ? (
              <Card
                className="border p-0 shadow-none"
                style={{
                  backgroundColor: tokens.bgSurface,
                  borderColor: tokens.divider,
                }}
              >
                <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
                  <Circle
                    className="h-5 w-5"
                    style={{ color: tokens.textTertiary }}
                  />
                  <p
                    className="text-[13px]"
                    style={{ color: tokens.textTertiary }}
                  >
                    Historico aparecera aqui apos a primeira versao.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="pl-1">
                {allVersionsSorted.map((v, idx) => (
                  <VersionTimelineEntry
                    key={v.id}
                    version={v}
                    tokens={tokens}
                    isLast={idx === allVersionsSorted.length - 1}
                  />
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </section>

      {canRollback && prevProdVersion && newest && (
        <AlertDialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reverter para v{prevProdVersion.versionNumber}?</AlertDialogTitle>
              <AlertDialogDescription>
                Isso cria uma nova versão v{(newest.versionNumber) + 1} com o conteúdo
                de v{prevProdVersion.versionNumber} e a torna ativa imediatamente. O
                histórico existente não é alterado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={rollbackPrompt.isPending}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={rollbackPrompt.isPending}
                onClick={handleRollbackConfirm}
              >
                {rollbackPrompt.isPending ? "Revertendo..." : "Confirmar reversão"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {newest && prodVersion && (
        <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Comparar versoes</DialogTitle>
              <DialogDescription>
                Revise as mudancas entre a versao em producao e a versao a
                publicar antes de confirmar.
              </DialogDescription>
            </DialogHeader>
            <PromptDiff
              oldContent={prodVersion.content}
              newContent={newest.content}
              oldLabel={`v${prodVersion.versionNumber} (atual)`}
              newLabel={`v${newest.versionNumber} (nova)`}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
