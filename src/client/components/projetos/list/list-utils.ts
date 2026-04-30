import type { ProjectStatus } from "@/client/components/projetos/types"
import type { FilterKey } from "./list-types"

export function formatRelative(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "agora"
  if (diffMin < 60) return `${diffMin}min atrás`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h atrás`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 30) return `${diffD}d atrás`
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(date)
}

export function matchesFilter(status: ProjectStatus, filter: FilterKey): boolean {
  switch (filter) {
    case "todos":
      return true
    case "ativos":
      return status === "production" || status === "paused"
    case "drafts":
      return status === "draft"
    case "arquivados":
      return status === "archived"
    default:
      return true
  }
}
