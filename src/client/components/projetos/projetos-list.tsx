"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table"
import { Input } from "@/client/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import {
  PROJECT_STATUS_LABEL,
  getProjectStatusStyle,
} from "@/lib/project-status"
import { getProjectTypeMeta } from "@/lib/project-type"
import type { ProjectStatus } from "@/client/components/projetos/types"

export interface ProjetoItem {
  id: string
  name: string
  type: string
  status: ProjectStatus
  updatedAt: Date | string
  aiAgentId: string | null
}

interface ProjetosListProps {
  projects: ProjetoItem[]
}

type FilterKey = "todos" | "ativos" | "drafts" | "arquivados"

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "ativos", label: "Ativos" },
  { key: "drafts", label: "Rascunhos" },
  { key: "arquivados", label: "Arquivados" },
]

function formatRelative(value: Date | string): string {
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

function matchesFilter(status: ProjectStatus, filter: FilterKey): boolean {
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

/**
 * ProjetosList — listagem table-style inspirada no v0 Chats page.
 *
 * Layout:
 *  - Header: H1 grande (serif display) + subtitle
 *  - Toolbar: Search (flex) + Filter dropdown + Novo projeto CTA
 *  - Table: Nome | Tipo | Status | Atualizado | Ações
 *  - Empty state centralizado
 *
 * Centralizado em max-w-5xl, tema reativo, linhas clicáveis com hover.
 */
export function ProjetosList({ projects }: ProjetosListProps) {
  const router = useRouter()
  const { tokens } = useAppTokens()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<FilterKey>("todos")

  const filtered = useMemo(() => {
    return projects
      .filter((p) => matchesFilter(p.status, filter))
      .filter((p) =>
        query.trim() === ""
          ? true
          : p.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
  }, [projects, filter, query])

  const countLabel =
    filtered.length === 1 ? "1 projeto" : `${filtered.length} projetos`

  return (
    <div
      className="mx-auto w-full max-w-5xl px-6 py-10 lg:px-10"
      style={{
        fontFamily: "var(--font-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <header className="mb-8">
        <p
          className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: tokens.brand }}
        >
          Workspace
        </p>
        <h1
          className="text-[2.5rem] font-bold leading-[1.05] tracking-tight sm:text-[3rem]"
          style={{
            fontFamily:
              "var(--font-display), Georgia, 'Times New Roman', serif",
            color: tokens.textPrimary,
          }}
        >
          Meus projetos
        </h1>
        <p
          className="mt-2 text-[15px]"
          style={{ color: tokens.textSecondary }}
        >
          Cada projeto é uma conversa que você teve com o Builder pra criar um
          agente de WhatsApp.
        </p>
      </header>

      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-0 flex-1 md:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: tokens.textTertiary }}
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome…"
            className="h-10 border-0 pl-9 text-[14px]"
            style={{
              backgroundColor: tokens.bgSurface,
              borderColor: tokens.border,
              color: tokens.textPrimary,
              border: `1px solid ${tokens.border}`,
            }}
            aria-label="Buscar projetos"
          />
        </div>

        {/* Filter dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-md border px-3.5 text-[13px] font-medium transition-colors"
              style={{
                backgroundColor: tokens.bgSurface,
                borderColor: tokens.border,
                color: tokens.textPrimary,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = tokens.hoverBg
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = tokens.bgSurface
              }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {FILTERS.find((f) => f.key === filter)?.label ?? "Filtro"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {FILTERS.map((f) => (
              <DropdownMenuItem key={f.key} onClick={() => setFilter(f.key)}>
                {f.label}
                {filter === f.key && (
                  <span
                    className="ml-auto h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: tokens.brand }}
                  />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* CTA Novo projeto */}
        <button
          type="button"
          onClick={() => router.push("/")}
          className="flex h-10 items-center gap-2 rounded-md px-4 text-[13px] font-semibold transition-opacity hover:opacity-90"
          style={{
            backgroundColor: tokens.brand,
            color: tokens.textInverse,
          }}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          Novo projeto
        </button>
      </div>

      {/* Count */}
      <div className="mb-2 flex items-center justify-between">
        <span
          className="text-[11px] font-medium uppercase tracking-[0.14em]"
          style={{ color: tokens.textTertiary }}
        >
          {countLabel}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState tokens={tokens} query={query} filter={filter} />
      ) : (
        <div
          className="overflow-hidden rounded-xl border"
          style={{
            backgroundColor: tokens.bgSurface,
            borderColor: tokens.border,
          }}
        >
          <Table>
            <TableHeader>
              <TableRow
                className="hover:bg-transparent"
                style={{ borderColor: tokens.divider }}
              >
                <TableHead
                  className="h-11 px-4 text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: tokens.textTertiary }}
                >
                  Nome
                </TableHead>
                <TableHead
                  className="h-11 text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: tokens.textTertiary }}
                >
                  Tipo
                </TableHead>
                <TableHead
                  className="h-11 text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: tokens.textTertiary }}
                >
                  Status
                </TableHead>
                <TableHead
                  className="h-11 text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: tokens.textTertiary }}
                >
                  Atualizado
                </TableHead>
                <TableHead className="h-11 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((project) => {
                const typeMeta = getProjectTypeMeta(project.type)
                const statusStyle = getProjectStatusStyle(project.status)
                const TypeIcon = typeMeta.icon
                return (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer transition-colors"
                    style={{ borderColor: tokens.divider }}
                    onClick={() => router.push(`/projetos/${project.id}`)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = tokens.hoverBg
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent"
                    }}
                  >
                    <TableCell className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            backgroundColor: tokens.brandSubtle,
                            color: tokens.brand,
                          }}
                        >
                          <TypeIcon className="h-4 w-4" />
                        </div>
                        <span
                          className="truncate text-[14px] font-semibold"
                          style={{ color: tokens.textPrimary }}
                        >
                          {project.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span
                        className="text-[13px]"
                        style={{ color: tokens.textSecondary }}
                      >
                        {typeMeta.shortLabel}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                        style={{
                          backgroundColor: statusStyle.bg,
                          color: statusStyle.color,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: statusStyle.dot }}
                        />
                        {PROJECT_STATUS_LABEL[project.status]}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span
                        className="text-[12px]"
                        style={{ color: tokens.textTertiary }}
                      >
                        {formatRelative(project.updatedAt)}
                      </span>
                    </TableCell>
                    <TableCell
                      className="py-3.5 pr-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                            style={{ color: tokens.textTertiary }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor =
                                tokens.hoverBg
                              e.currentTarget.style.color = tokens.textPrimary
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor =
                                "transparent"
                              e.currentTarget.style.color = tokens.textTertiary
                            }}
                            aria-label="Ações"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => router.push(`/projetos/${project.id}`)}
                          >
                            Abrir
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled>Renomear</DropdownMenuItem>
                          <DropdownMenuItem disabled>Duplicar</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem disabled className="text-destructive">
                            Arquivar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function EmptyState({
  tokens,
  query,
  filter,
}: {
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  query: string
  filter: FilterKey
}) {
  const isSearching = query.trim() !== ""
  const filterLabel = FILTERS.find((f) => f.key === filter)?.label ?? ""
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-xl border py-16 text-center"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
      }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: tokens.brandSubtle,
          color: tokens.brand,
        }}
      >
        <Filter className="h-6 w-6" />
      </div>
      <div>
        <h3
          className="text-base font-semibold"
          style={{ color: tokens.textPrimary }}
        >
          {isSearching
            ? "Nada encontrado"
            : filter === "todos"
              ? "Nenhum projeto ainda"
              : `Nenhum projeto em ${filterLabel.toLowerCase()}`}
        </h3>
        <p
          className="mx-auto mt-1 max-w-sm text-[13px]"
          style={{ color: tokens.textSecondary }}
        >
          {isSearching
            ? "Tente ajustar a busca ou o filtro."
            : "Descreva o que quer criar lá na home e o Builder cria o primeiro agente em segundos."}
        </p>
      </div>
    </div>
  )
}
