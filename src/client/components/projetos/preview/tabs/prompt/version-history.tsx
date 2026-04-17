"use client"

/**
 * VersionHistory — lista de versoes publicadas do system prompt.
 *
 * Consome `GET /api/v1/builder/projects/:id/versions` via `api.builder.listVersions`.
 * O client Igniter e auto-gerado; usamos cast caso o tipo ainda nao tenha
 * propagado (padrao ja aplicado em use-prompt-autosave.ts).
 *
 * Loading: 3 skeletons. Empty: mensagem + icone History. Lista: botao clicavel
 * por item (no-op hoje, reservado para diff/rollback da fase 3).
 */

import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { History } from "lucide-react"
import { api } from "@/igniter.client"
import { Card, CardContent } from "@/client/components/ui/card"
import { Skeleton } from "@/client/components/ui/skeleton"
import type { VersionHistoryProps, VersionListItem } from "./prompt-types"

type ListVersionsHook = {
  useQuery: (args: { params: { id: string } }) => {
    data?: { versions: VersionListItem[] } | { versions: VersionListItem[] }[]
    isPending: boolean
    error?: Error
  }
}

export function VersionHistory({ tokens, projectId }: VersionHistoryProps) {
  const listVersions = (
    api.builder as unknown as { listVersions: ListVersionsHook }
  ).listVersions
  const { data, isPending, error } = listVersions.useQuery({
    params: { id: projectId },
  })

  // Unwrap tolerant: Igniter pode devolver { versions } ou envoltorio.
  const versions: VersionListItem[] = Array.isArray(data)
    ? (data[0]?.versions ?? [])
    : (data?.versions ?? [])

  return (
    <section>
      <h3
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: tokens.textTertiary }}
      >
        Versoes anteriores
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
              Nao foi possivel carregar o historico. Tente novamente em instantes.
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
                Ainda nao ha versoes publicadas. Publique pela primeira vez
                para comecar o historico.
              </p>
            </div>
          ) : (
            versions.map((v) => <VersionRow key={v.id} version={v} tokens={tokens} />)
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function VersionRow({
  version,
  tokens,
}: {
  version: VersionListItem
  tokens: VersionHistoryProps["tokens"]
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
    <button
      type="button"
      // TODO(fase3-diff): abrir PromptDiff quando C3 expuser API
      onClick={() => {
        /* no-op: reservado para diff/rollback */
      }}
      className="flex w-full flex-col gap-1 rounded-md border p-3 text-left transition-colors hover:bg-overlay10 focus-visible:outline-none focus-visible:ring-2"
      style={{
        borderColor: tokens.divider,
        backgroundColor: "transparent",
      }}
    >
      <div className="flex items-center gap-2">
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
      </div>

      <div className="flex items-center justify-between gap-2">
        <span
          className="truncate text-[12px]"
          style={{ color: tokens.textSecondary }}
        >
          {version.description ?? "Sem descricao"}
        </span>
        <span
          className="shrink-0 text-[11px]"
          style={{ color: tokens.textTertiary }}
        >
          {relative}
        </span>
      </div>

      {version.publishedBy ? (
        <span
          className="text-[11px]"
          style={{ color: tokens.textTertiary }}
        >
          por {version.publishedBy.name}
        </span>
      ) : null}
    </button>
  )
}
