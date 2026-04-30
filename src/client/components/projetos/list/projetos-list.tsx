"use client"

import { useState } from "react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type { ProjetosListProps, FilterKey } from "./list-types"
import { useFilteredProjects } from "./hooks/use-filtered-projects"
import { ListHeader } from "./list-header"
import { ListToolbar } from "./list-toolbar"
import { ListTable } from "./list-table"
import { EmptyState } from "./list-empty-state"

export type { ProjetosListProps, ProjetoItem } from "./list-types"

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
  const { tokens } = useAppTokens()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<FilterKey>("todos")

  const filtered = useFilteredProjects(projects, filter, query)

  const countLabel =
    filtered.length === 1 ? "1 projeto" : `${filtered.length} projetos`

  return (
    <div
      className="mx-auto w-full max-w-5xl px-6 py-10 lg:px-10"
      style={{
        fontFamily: "var(--font-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      <ListHeader tokens={tokens} />

      <ListToolbar
        tokens={tokens}
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
      />

      {/* Count */}
      <div className="mb-2 flex items-center justify-between">
        <span
          className="text-[11px] font-medium uppercase tracking-[0.14em]"
          style={{ color: tokens.textTertiary }}
        >
          {countLabel}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState tokens={tokens} query={query} filter={filter} />
      ) : (
        <ListTable projects={filtered} tokens={tokens} />
      )}
    </div>
  )
}
