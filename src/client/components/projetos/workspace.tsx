'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, MoreVertical, MessageSquare, Bot } from 'lucide-react'

import { Button } from '@/client/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import { ChatPanel } from './chat-panel'
import { PreviewPanel } from './preview-panel'
import type {
  ChatMessage,
  PreviewTab,
  ProjectStatus,
  WorkspaceProject,
} from './types'

// ============================================================
// Props
// ============================================================

interface WorkspaceProps {
  project: WorkspaceProject
  initialMessages: ChatMessage[]
}

// ============================================================
// Helpers
// ============================================================

const VALID_TABS: PreviewTab[] = ['overview', 'prompt', 'playground', 'deploy']

function parseTab(value: string | null): PreviewTab {
  if (value && (VALID_TABS as string[]).includes(value)) {
    return value as PreviewTab
  }
  return 'overview'
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Rascunho',
  production: 'Produção',
  paused: 'Pausado',
  archived: 'Arquivado',
}

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  draft:
    'bg-muted text-muted-foreground border border-border/60',
  production:
    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
  paused:
    'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
  archived:
    'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20',
}

// ============================================================
// Component
// ============================================================

export function Workspace({ project, initialMessages }: WorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ------------------------------------------------------------------
  // Editable name (stubbed — real endpoint is a future US)
  // ------------------------------------------------------------------
  const [name, setName] = React.useState(project.name)
  const [isEditingName, setIsEditingName] = React.useState(false)

  const handleNameSubmit = React.useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (trimmed && trimmed !== project.name) {
        // TODO US-future: POST /api/v1/builder/projects/:id/rename
        console.log('[workspace] rename stub', { id: project.id, name: trimmed })
        setName(trimmed)
      } else {
        setName(project.name)
      }
      setIsEditingName(false)
    },
    [project.id, project.name],
  )

  // ------------------------------------------------------------------
  // Tab state (URL-persisted via ?tab=)
  // ------------------------------------------------------------------
  const activeTab = React.useMemo(
    () => parseTab(searchParams.get('tab')),
    [searchParams],
  )

  const handleTabChange = React.useCallback(
    (tab: PreviewTab) => {
      const params = new URLSearchParams(searchParams.toString())
      if (tab === 'overview') {
        params.delete('tab')
      } else {
        params.set('tab', tab)
      }
      const qs = params.toString()
      router.replace(`/projetos/${project.id}${qs ? `?${qs}` : ''}`, {
        scroll: false,
      })
    },
    [project.id, router, searchParams],
  )

  // ------------------------------------------------------------------
  // Mobile toggle (chat | preview) — only matters < 768px
  // ------------------------------------------------------------------
  const [mobilePanel, setMobilePanel] = React.useState<'chat' | 'preview'>(
    'chat',
  )

  // ------------------------------------------------------------------
  // Menu action stubs (Arquivar / Duplicar / Renomear)
  // ------------------------------------------------------------------
  const handleMenuAction = React.useCallback(
    (action: 'archive' | 'duplicate' | 'rename') => {
      console.log('[workspace] menu stub', { id: project.id, action })
      if (action === 'rename') {
        setIsEditingName(true)
      }
    },
    [project.id],
  )

  // ==================================================================
  // Render
  // ==================================================================
  return (
    <div className="flex h-screen flex-col bg-background">
      {/* ---------- Sticky header ---------- */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <Link href="/projetos" aria-label="Voltar para projetos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>

          {/* Editable project name */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {isEditingName ? (
              <input
                autoFocus
                defaultValue={name}
                onBlur={(e) => handleNameSubmit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    ;(e.target as HTMLInputElement).blur()
                  }
                  if (e.key === 'Escape') {
                    setIsEditingName(false)
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-border/80 bg-background px-2 py-1 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
                aria-label="Nome do projeto"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingName(true)}
                className="min-w-0 truncate rounded-md px-2 py-1 text-left text-sm font-semibold hover:bg-muted/60"
                title="Clique para renomear"
              >
                {name}
              </button>
            )}

            {/* Status badge */}
            <span
              className={cn(
                'hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide sm:inline-flex',
                STATUS_CLASSES[project.status],
              )}
            >
              {STATUS_LABEL[project.status]}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Mobile panel toggle */}
          <div className="flex items-center gap-1 md:hidden">
            <Button
              type="button"
              size="sm"
              variant={mobilePanel === 'chat' ? 'secondary' : 'ghost'}
              onClick={() => setMobilePanel('chat')}
              className="h-8 gap-1 px-2 text-xs"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mobilePanel === 'preview' ? 'secondary' : 'ghost'}
              onClick={() => setMobilePanel('preview')}
              className="h-8 gap-1 px-2 text-xs"
            >
              <Bot className="h-3.5 w-3.5" />
              Agente
            </Button>
          </div>

          {/* ⋯ menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Ações do projeto"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => handleMenuAction('rename')}>
                Renomear
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleMenuAction('duplicate')}>
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleMenuAction('archive')}
                className="text-destructive focus:text-destructive"
              >
                Arquivar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ---------- Body: split layout ---------- */}
      <main className="flex min-h-0 flex-1 overflow-hidden">
        {/* Chat side — visible on desktop always; on mobile only when chat panel selected */}
        <section
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col border-border/60 md:max-w-[50%] md:border-r lg:max-w-[50%]',
            mobilePanel === 'chat' ? 'flex' : 'hidden md:flex',
          )}
        >
          <ChatPanel projectId={project.id} initialMessages={initialMessages} />
        </section>

        {/* Preview side */}
        <section
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col md:max-w-[50%] lg:max-w-[50%]',
            mobilePanel === 'preview' ? 'flex' : 'hidden md:flex',
          )}
        >
          <PreviewPanel
            project={project}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </section>
      </main>
    </div>
  )
}
