'use client'

/**
 * OverviewTab — US-025
 *
 * Dashboard-style view of the project's agent: identity, status, metric
 * placeholders, and quick action buttons that cross-navigate to other tabs
 * or back into the chat.
 */

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import type { WorkspaceProject, ProjectStatus } from '@/client/components/projetos/types'

interface OverviewTabProps {
  project: WorkspaceProject
  onSwitchToChat?: () => void
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Rascunho',
  production: 'Em producao',
  paused: 'Pausado',
  archived: 'Arquivado',
}

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  production: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  draft: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  paused: 'bg-red-500/10 text-red-600 border-red-500/20',
  archived: 'bg-muted text-muted-foreground border-border',
}

export function OverviewTab({ project, onSwitchToChat }: OverviewTabProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const goToTab = (tab: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', tab)
    router.push(`${pathname}?${params.toString()}`)
  }

  if (!project.aiAgent) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Aguardando o Builder criar o agente. Continue a conversa no chat.
          </CardContent>
        </Card>
      </div>
    )
  }

  const { aiAgent, status } = project

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-semibold">{aiAgent.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {aiAgent.provider} / {aiAgent.model}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CLASSES[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      <Card>
        <CardContent className="p-6">
          <h3 className="mb-4 text-sm font-medium">Metricas</h3>
          {status === 'draft' ? (
            <p className="text-sm text-muted-foreground">
              Agente ainda nao publicado. Publique para comecar a coletar metricas.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Mensagens</div>
                <div className="mt-1 text-2xl font-semibold">0</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Taxa de resposta</div>
                <div className="mt-1 text-2xl font-semibold">—%</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="default"
          onClick={() => {
            if (onSwitchToChat) onSwitchToChat()
          }}
        >
          Continuar no chat
        </Button>
        <Button variant="outline" onClick={() => goToTab('playground')}>
          Testar no playground
        </Button>
        <Button variant="outline" onClick={() => goToTab('deploy')}>
          Publicar
        </Button>
      </div>
    </div>
  )
}
