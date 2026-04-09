'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, FolderOpen } from 'lucide-react'
import { Input } from '@/client/components/ui/input'
import { Card, CardContent } from '@/client/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/client/components/ui/tabs'
import {
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_STYLE,
} from '@/lib/project-status'
import type { ProjectStatus } from '@/client/components/projetos/types'

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

type FilterKey = 'todos' | 'ativos' | 'drafts' | 'arquivados'

const GROUP_ORDER: Array<{ key: ProjectStatus; title: string }> = [
  { key: 'production', title: 'Produção' },
  { key: 'draft', title: 'Drafts' },
  { key: 'paused', title: 'Pausados' },
  { key: 'archived', title: 'Arquivados' },
]

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function formatRelative(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'agora mesmo'
  if (diffMin < 60) return `há ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `há ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `há ${diffD}d`
  return dateFormatter.format(date)
}

function matchesFilter(status: ProjectStatus, filter: FilterKey): boolean {
  switch (filter) {
    case 'todos':
      return true
    case 'ativos':
      return status === 'production' || status === 'paused'
    case 'drafts':
      return status === 'draft'
    case 'arquivados':
      return status === 'archived'
    default:
      return true
  }
}

const EMPTY_LABEL: Record<FilterKey, string> = {
  todos: 'Nenhuma conversa ainda',
  ativos: 'Nenhuma conversa ativa ainda',
  drafts: 'Nenhum rascunho ainda',
  arquivados: 'Nenhuma conversa arquivada ainda',
}

export function ProjetosList({ projects }: ProjetosListProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('todos')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projects.filter((p) => {
      if (!matchesFilter(p.status, filter)) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q)
    })
  }, [projects, query, filter])

  const grouped = useMemo(() => {
    const map: Record<ProjectStatus, ProjetoItem[]> = {
      production: [],
      draft: [],
      paused: [],
      archived: [],
    }
    for (const p of filtered) map[p.status].push(p)
    return map
  }, [filtered])

  const handleOpen = (id: string) => {
    router.push(`/projetos/${id}`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Conversas</h1>
        <p className="text-sm text-muted-foreground">
          Cada conversa com o Builder cria um agente de WhatsApp.
        </p>
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome..."
            className="pl-9"
            aria-label="Buscar conversas"
          />
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="ativos">Ativos</TabsTrigger>
            <TabsTrigger value="drafts">Drafts</TabsTrigger>
            <TabsTrigger value="arquivados">Arquivados</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-16 text-center">
          <FolderOpen className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">
            {query ? 'Nenhuma conversa encontrada' : EMPTY_LABEL[filter]}
          </p>
          {query && (
            <p className="mt-1 text-xs text-muted-foreground">
              Tente ajustar sua busca.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {GROUP_ORDER.map(({ key, title }) => {
            const items = grouped[key]
            if (items.length === 0) return null
            return (
              <section key={key} className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {title}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {items.length}{' '}
                    {items.length === 1 ? 'conversa' : 'conversas'}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {items.map((project) => {
                    const badgeClassName = PROJECT_STATUS_STYLE[project.status].className
                    const badgeLabel = PROJECT_STATUS_LABEL[project.status]
                    return (
                      <Card
                        key={project.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleOpen(project.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleOpen(project.id)
                          }
                        }}
                        className="group cursor-pointer border-border/60 transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <CardContent className="flex flex-col gap-3 p-5">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="line-clamp-2 text-base font-semibold leading-snug group-hover:text-primary">
                              {project.name}
                            </h3>
                            <span
                              className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClassName}`}
                            >
                              {badgeLabel}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Última atualização: {formatRelative(project.updatedAt)}
                          </p>
                          {project.status === 'production' && (
                            <p className="text-xs text-muted-foreground">
                              — conversas/dia
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
