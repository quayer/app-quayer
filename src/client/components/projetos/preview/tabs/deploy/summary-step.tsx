"use client"

/**
 * SummaryStep — version status cards + history timeline (step 4)
 *
 * Displays production/draft status (via VersionStatusCards) plus a
 * collapsible chronological list of every PromptVersion.
 *
 * As versões chegam por PROP do deploy-tab (query única
 * `["project-versions", projectId]`) — sem fetch próprio, para o pós-publish
 * invalidar UMA key e atualizar resumo, diff e timeline juntos. O rollback
 * notifica o orquestrador via `onVersionsChanged` (sem window.location.reload).
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
import type { VersionListItem } from "./version-utils"

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
  const dotColor = isPublished ? tokens.success : tokens.brand

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
                  ? tokens.successSubtle
                  : tokens.brandSubtle,
                color: isPublished ? tokens.successText : tokens.brand,
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
      </div>
    </div>
  )
}

interface SummaryStepProps {
  tokens: Tokens
  /** Lista completa de versões (fonte única do deploy-tab, DESC). */
  versions: VersionListItem[]
  loading: boolean
  production: VersionListItem | null
  draft: VersionListItem | null
  projectId: string
  /** Invalida a query de versões + readiness no orquestrador (pós-rollback). */
  onVersionsChanged: () => void | Promise<void>
}

export function SummaryStep({
  tokens,
  versions,
  loading,
  production,
  draft,
  projectId,
  onVersionsChanged,
}: SummaryStepProps) {
  const [diffOpen, setDiffOpen] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)

  const rollbackPrompt = api.builder.rollbackPrompt as unknown as RollbackPromptClient

  const fullVersions = useMemo<VersionListItem[]>(
    () => [...versions].sort((a, b) => b.versionNumber - a.versionNumber),
    [versions],
  )

  const newest = fullVersions[0] ?? null
  // The version currently live in prod = the most recent published one.
  const prodVersion = fullVersions.find((v) => v.publishedAt !== null) ?? null
  // For rollback we need at least one published version AND an older published
  // version to go back to.
  const prevProdVersion = useMemo<VersionListItem | null>(() => {
    const published = fullVersions.filter((v) => v.publishedAt !== null)
    // published[0] is the latest published, published[1] is the one before it
    return published.length >= 2 ? (published[1] ?? null) : null
  }, [fullVersions])

  // Show rollback when the current prod version is the newest and there's a
  // previous published version to revert to.
  const canRollback =
    newest !== null &&
    newest.publishedAt !== null &&
    prevProdVersion !== null

  const canShowDiff =
    newest !== null && prodVersion !== null && newest.id !== prodVersion.id

  function handleRollbackConfirm() {
    if (!prevProdVersion || rollbackPrompt.isPending) return
    rollbackPrompt.mutate(
      { params: { id: projectId }, body: { targetVersionId: prevProdVersion.id } },
      {
        onSuccess: (data) => {
          toast.success(
            `Revertido para v${prevProdVersion.versionNumber} (nova versão v${data.versionNumber})`,
          )
          setRollbackOpen(false)
          void onVersionsChanged()
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Erro ao reverter"
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
        versions={fullVersions}
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
            Resumo da publicação
          </h3>
          <div className="flex items-center gap-2">
            <AskBuilderButton
              tokens={tokens}
              variant="small"
              message="Estou pronto para publicar. Há algo que você recomendaria ajustar antes?"
            />
            {canRollback && prevProdVersion && (
              <button
                type="button"
                disabled={rollbackPrompt.isPending}
                onClick={() => setRollbackOpen(true)}
                className="inline-flex min-h-10 items-center gap-1 rounded-md border px-3 text-[11px] font-medium transition-colors disabled:opacity-50"
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
                className="inline-flex min-h-10 items-center gap-1 rounded-md border px-3 text-[11px] font-medium transition-colors"
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

        {loading ? (
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
                Versão a publicar
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
                Versão atual em produção
              </span>
              <span
                className="font-semibold"
                style={{ color: tokens.textPrimary }}
              >
                {prodVersion
                  ? `v${prodVersion.versionNumber}`
                  : "Será a primeira versão publicada"}
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
              Histórico de versões
            </h3>
            <ChevronDown
              className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180"
              style={{ color: tokens.textTertiary }}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {loading ? (
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
            ) : fullVersions.length === 0 ? (
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
                    Histórico aparecerá aqui após a primeira versão.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="pl-1">
                {fullVersions.map((v, idx) => (
                  <VersionTimelineEntry
                    key={v.id}
                    version={v}
                    tokens={tokens}
                    isLast={idx === fullVersions.length - 1}
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
              <DialogTitle>Comparar versões</DialogTitle>
              <DialogDescription>
                Revise as mudanças entre a versão em produção e a versão a
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
