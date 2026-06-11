"use client"

/**
 * VersionHistory — histórico de versões do system prompt (drafts + publicadas).
 *
 * Consome `GET /api/v1/builder/projects/:id/versions` via `api.builder.listVersions`.
 * O client Igniter é auto-gerado; usamos cast caso o tipo ainda não tenha
 * propagado.
 *
 * "Atual" é por CONTEÚDO (version.content === editorValue) — nunca por posição
 * na lista, que mente quando o editor divergiu. O diff compara a versão
 * selecionada com o conteúdo vivo do editor. Rollback notifica o pai via
 * `onRestored(content)` para o editor sincronizar sem F5.
 */

import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { GitCompare, History, RotateCcw } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { api } from "@/igniter.client"
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
import { Card, CardContent } from "@/client/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog"
import { Skeleton } from "@/client/components/ui/skeleton"
import type { VersionHistoryProps, VersionListItem } from "./prompt-types"
import { PromptDiff } from "../deploy/prompt-diff"

type ListVersionsHook = {
  useQuery: (args: { params: { id: string } }) => {
    data?: { versions: VersionListItem[] } | { versions: VersionListItem[] }[]
    isPending: boolean
    error?: Error
    refetch: () => Promise<unknown>
  }
}

interface RollbackPromptClient {
  mutate: (
    args: { params: { id: string }; body: { targetVersionId: string } },
    options: {
      onSuccess: (data: { versionNumber: number; content: string }) => void
      onError: (err: unknown) => void
    },
  ) => void
  isPending: boolean
}

export function VersionHistory({
  tokens,
  projectId,
  editorValue,
  onRestored,
}: VersionHistoryProps) {
  const [selectedVersion, setSelectedVersion] =
    useState<VersionListItem | null>(null)
  const [rollbackTarget, setRollbackTarget] =
    useState<VersionListItem | null>(null)

  const listVersions = (
    api.builder as unknown as { listVersions: ListVersionsHook }
  ).listVersions
  const { data, isPending, error, refetch } = listVersions.useQuery({
    params: { id: projectId },
  })
  const rollbackPrompt = api.builder.rollbackPrompt as unknown as RollbackPromptClient

  // Unwrap tolerant: Igniter pode devolver { versions } ou envoltorio.
  const versions: VersionListItem[] = useMemo(() => {
    const rows = Array.isArray(data)
      ? (data[0]?.versions ?? [])
      : (data?.versions ?? [])
    return [...rows].sort((a, b) => b.versionNumber - a.versionNumber)
  }, [data])

  /** Versão mais recente por número — referência para a numeração do rollback. */
  const latestVersion = versions[0] ?? null

  function handleRollbackConfirm() {
    if (!rollbackTarget) return
    rollbackPrompt.mutate(
      {
        params: { id: projectId },
        body: { targetVersionId: rollbackTarget.id },
      },
      {
        onSuccess: (result) => {
          toast.success(
            `Prompt restaurado para v${rollbackTarget.versionNumber} (nova v${result.versionNumber})`,
          )
          setRollbackTarget(null)
          void refetch()
          // Sincroniza o editor com o conteúdo restaurado — sem isso o editor
          // mantém o texto antigo e o próximo autosave desfaria o rollback.
          onRestored?.(result.content)
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : "Erro ao restaurar prompt"
          toast.error(msg)
          setRollbackTarget(null)
        },
      },
    )
  }

  return (
    <section>
      <h3
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: tokens.textTertiary }}
      >
        Versões anteriores
      </h3>

      <Card
        className="border p-0 shadow-none"
        style={{
          backgroundColor: tokens.bgSurface,
          borderColor: tokens.divider,
        }}
      >
        <CardContent className="flex flex-col gap-2 p-3">
          {isPending ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : error ? (
            <p
              className="px-2 py-4 text-center text-[13px]"
              style={{ color: tokens.textSecondary }}
            >
              Não foi possível carregar o histórico. Tente novamente em instantes.
            </p>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
              <History
                className="h-5 w-5"
                style={{ color: tokens.textTertiary }}
                aria-hidden
              />
              <p
                className="text-[13px]"
                style={{ color: tokens.textSecondary }}
              >
                O histórico começa quando o Builder gera o prompt do agente —
                ou na sua primeira edição manual.
              </p>
            </div>
          ) : (
            versions.map((v) => (
              <VersionRow
                key={v.id}
                version={v}
                tokens={tokens}
                isCurrent={v.content === editorValue}
                rollbackPending={rollbackPrompt.isPending}
                onInspect={() => setSelectedVersion(v)}
                onRollback={() => setRollbackTarget(v)}
              />
            ))
          )}
        </CardContent>
      </Card>

      {selectedVersion && (
        <Dialog
          open={selectedVersion !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedVersion(null)
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Comparar prompt v{selectedVersion.versionNumber}</DialogTitle>
              <DialogDescription>
                Compare a versão selecionada com o conteúdo atual do editor.
              </DialogDescription>
            </DialogHeader>
            <PromptDiff
              oldContent={selectedVersion.content}
              newContent={editorValue}
              oldLabel={`v${selectedVersion.versionNumber}`}
              newLabel="Editor (atual)"
            />
          </DialogContent>
        </Dialog>
      )}

      {rollbackTarget && latestVersion && (
        <AlertDialog
          open={rollbackTarget !== null}
          onOpenChange={(open) => {
            if (!open) setRollbackTarget(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Restaurar v{rollbackTarget.versionNumber}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Isso cria uma nova versão v{latestVersion.versionNumber + 1}
                com o conteúdo de v{rollbackTarget.versionNumber}. O histórico
                existente não é alterado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={rollbackPrompt.isPending}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={rollbackPrompt.isPending}
                onClick={(event) => {
                  event.preventDefault()
                  handleRollbackConfirm()
                }}
              >
                {rollbackPrompt.isPending ? "Restaurando..." : "Restaurar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  )
}

function VersionRow({
  version,
  tokens,
  isCurrent,
  rollbackPending,
  onInspect,
  onRollback,
}: {
  version: VersionListItem
  tokens: VersionHistoryProps["tokens"]
  /** True quando o conteúdo da versão é exatamente o conteúdo em uso no editor. */
  isCurrent: boolean
  rollbackPending: boolean
  onInspect: () => void
  onRollback: () => void
}) {
  const isPublished = version.publishedAt !== null
  const statusLabel = isPublished ? "Publicada" : "Rascunho"
  const statusBg = isPublished ? tokens.brandSubtle : tokens.hoverBg
  const statusFg = isPublished ? tokens.brandText : tokens.textSecondary
  const statusBorder = isPublished ? tokens.brandBorder : tokens.divider

  const relative = formatDistanceToNow(new Date(version.createdAt), {
    addSuffix: true,
    locale: ptBR,
  })

  return (
    <article
      className="flex flex-col gap-3 rounded-md border p-3 transition-colors hover:bg-overlay10"
      style={{
        borderColor: tokens.divider,
        backgroundColor: "transparent",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-[13px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              v{version.versionNumber}
            </span>
            <span
              className="rounded-full border px-2 py-[1px] text-[10px] font-medium uppercase tracking-wide"
              style={{
                backgroundColor: statusBg,
                color: statusFg,
                borderColor: statusBorder,
              }}
            >
              {statusLabel}
            </span>
            {isCurrent && (
              <span
                className="rounded-full border px-2 py-[1px] text-[10px] font-medium uppercase tracking-wide"
                style={{
                  backgroundColor: tokens.brandSubtle,
                  color: tokens.brandText,
                  borderColor: tokens.brandBorder,
                }}
              >
                Atual
              </span>
            )}
          </div>

          <p
            className="mt-1 truncate text-[12px]"
            style={{ color: tokens.textSecondary }}
          >
            {version.description ?? "Sem descrição"}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className="shrink-0 text-[11px]"
              style={{ color: tokens.textTertiary }}
            >
              {relative}
            </span>
            {version.publishedBy ? (
              <span
                className="text-[11px]"
                style={{ color: tokens.textTertiary }}
              >
                por {version.publishedBy.name}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onInspect}
            className="inline-flex min-h-10 items-center gap-1 rounded-md border px-3 text-[11px] font-medium transition-colors hover:opacity-80"
            style={{
              borderColor: tokens.divider,
              color: tokens.textPrimary,
              backgroundColor: tokens.bgSurface,
            }}
          >
            <GitCompare className="h-3 w-3" />
            Diff
          </button>
          {!isCurrent && (
            <button
              type="button"
              disabled={rollbackPending}
              onClick={onRollback}
              className="inline-flex min-h-10 items-center gap-1 rounded-md border px-3 text-[11px] font-medium transition-colors hover:opacity-80 disabled:opacity-50"
              style={{
                borderColor: tokens.divider,
                color: tokens.textPrimary,
                backgroundColor: tokens.bgSurface,
              }}
            >
              <RotateCcw className="h-3 w-3" />
              Restaurar
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
