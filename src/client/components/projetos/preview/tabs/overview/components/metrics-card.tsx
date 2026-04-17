"use client"

import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { api } from "@/igniter.client"
import { Card, CardContent } from "@/client/components/ui/card"
import { Skeleton } from "@/client/components/ui/skeleton"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { ProjectMetrics } from "@/server/ai-module/builder/projects/projects.routes"

// ---------------------------------------------------------------------------
// Cast type for the auto-generated client (not yet refreshed)
// ---------------------------------------------------------------------------

interface GetMetricsQuery {
  useQuery: (opts: { params: { id: string } }) => {
    data: ProjectMetrics | undefined
    isLoading: boolean
    isError: boolean
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricSkeleton({ tokens }: { tokens: AppTokens }) {
  return (
    <div>
      <Skeleton
        className="mb-1 h-3 w-20 rounded"
        style={{ backgroundColor: tokens.divider }}
      />
      <Skeleton
        className="h-7 w-12 rounded"
        style={{ backgroundColor: tokens.divider }}
      />
    </div>
  )
}

function Metric({
  label,
  value,
  tokens,
}: {
  label: string
  value: string
  tokens: AppTokens
}) {
  return (
    <div>
      <div
        className="text-[11px] font-medium uppercase tracking-wider"
        style={{ color: tokens.textTertiary }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-bold"
        style={{ color: tokens.textPrimary }}
      >
        {value}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MetricsCard
// ---------------------------------------------------------------------------

export function MetricsCard({
  tokens,
  projectId,
}: {
  tokens: AppTokens
  projectId: string
}) {
  const getMetrics = api.builder.getMetrics as unknown as GetMetricsQuery
  const { data, isLoading, isError } = getMetrics.useQuery({
    params: { id: projectId },
  })

  const fmt = (n: number) =>
    new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(n)

  const lastMsgLabel = (() => {
    if (!data?.lastMessageAt) return "—"
    try {
      return formatDistanceToNow(new Date(data.lastMessageAt), {
        locale: ptBR,
        addSuffix: true,
      })
    } catch {
      return "—"
    }
  })()

  const totalTokens =
    data &&
    data.totalInputTokens !== null &&
    data.totalOutputTokens !== null
      ? data.totalInputTokens + data.totalOutputTokens
      : null

  return (
    <Card
      className="border p-0 shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <CardContent className="p-5">
        <h3
          className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: tokens.textTertiary }}
        >
          Métricas
        </h3>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-6">
            <MetricSkeleton tokens={tokens} />
            <MetricSkeleton tokens={tokens} />
            <MetricSkeleton tokens={tokens} />
            <MetricSkeleton tokens={tokens} />
          </div>
        ) : isError ? (
          <p
            className="text-[12px]"
            style={{ color: tokens.textTertiary }}
          >
            Métricas indisponíveis no momento.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <Metric
              label="Mensagens (24h)"
              value={data ? fmt(data.messages24h) : "—"}
              tokens={tokens}
            />
            <Metric
              label="Conversas (24h)"
              value={data ? fmt(data.conversations24h) : "—"}
              tokens={tokens}
            />
            {totalTokens !== null && (
              <Metric
                label="Tokens consumidos"
                value={fmt(totalTokens)}
                tokens={tokens}
              />
            )}
            <Metric
              label="Última mensagem"
              value={lastMsgLabel}
              tokens={tokens}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
