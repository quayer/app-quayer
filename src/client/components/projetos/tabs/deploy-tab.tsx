'use client'

/**
 * DeployTab — US-028
 *
 * Surfaces production vs draft prompt versions, lets the user promote a
 * draft via POST /api/v1/builder/projects/publish, and shows the publish
 * history with stubbed rollback buttons.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/client/components/ui/alert-dialog'
import type { WorkspaceProject } from '@/client/components/projetos/types'

interface DeployTabProps {
  project: WorkspaceProject
}

interface PromptVersion {
  id: string
  versionNumber: number
  description: string | null
  publishedAt: string | null
  createdAt: string
}

export function DeployTab({ project }: DeployTabProps) {
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    if (!project.aiAgent) return
    let cancelled = false
    setLoading(true)
    // TODO: wire GET /api/v1/builder/projects/:id/versions
    // For now stub with empty list until the list endpoint exists.
    ;(async () => {
      try {
        // Placeholder — no endpoint yet. Leaving fetch scaffolding for the
        // future. If/when the endpoint lands, replace with:
        // const res = await fetch(`/api/v1/builder/projects/${project.id}/versions`)
        // const json = await res.json()
        // if (!cancelled) setVersions(json.data ?? [])
        if (!cancelled) setVersions([])
      } catch (err) {
        console.error('[deploy-tab] failed to load versions', err)
        if (!cancelled) setVersions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [project.id, project.aiAgent])

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

  // Partition: production = most recent with publishedAt, draft = most recent overall not yet published.
  const published = versions.filter((v) => v.publishedAt !== null)
  const drafts = versions.filter((v) => v.publishedAt === null)
  const production = published[0] ?? null
  const draft = drafts[0] ?? null

  const handlePublish = async () => {
    if (!draft) return
    setPublishing(true)
    try {
      const res = await fetch('/api/v1/builder/projects/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          promptVersionId: draft.id,
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `HTTP ${res.status}`)
      }
      toast.success(`Versao v${draft.versionNumber} publicada com sucesso.`)
      setConfirmOpen(false)
      // Optimistic: mark draft as published locally. A real refetch would
      // replace this once the list endpoint exists.
      setVersions((prev) =>
        prev.map((v) =>
          v.id === draft.id ? { ...v, publishedAt: new Date().toISOString() } : v
        )
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao publicar'
      toast.error(`Falha ao publicar: ${msg}`)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Deploy</h2>
        <p className="text-sm text-muted-foreground">
          Gerencie versoes de prompt em producao e publique novos rascunhos.
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Producao
            </div>
            <div className="mt-1 text-lg font-semibold">
              {production ? `v${production.versionNumber}` : 'Sem versao em producao'}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Draft
            </div>
            <div className="mt-1 text-lg font-semibold">
              {draft ? `v${draft.versionNumber}` : 'Sem draft'}
            </div>
          </div>
        </CardContent>
      </Card>

      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Ver diff
        </summary>
        <div className="border-t p-4 text-sm text-muted-foreground">
          {/* TODO: render real diff once we have prod + draft content loaded */}
          Diff indisponivel.
        </div>
      </details>

      <div>
        <Button
          disabled={!draft || publishing}
          onClick={() => setConfirmOpen(true)}
        >
          {draft ? `Publicar v${draft.versionNumber}` : 'Sem draft para publicar'}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Publicar v{draft?.versionNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Conversas em andamento continuam com v
              {production?.versionNumber ?? '—'} ate terminar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handlePublish()
              }}
              disabled={publishing}
            >
              {publishing ? 'Publicando...' : 'Publicar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div>
        <h3 className="mb-3 text-sm font-medium">Historico</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : published.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma versao publicada ainda.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {published.map((v) => (
              <Card key={v.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="text-sm font-medium">
                      v{v.versionNumber}
                      {v.description ? ` — ${v.description}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {v.publishedAt
                        ? new Date(v.publishedAt).toLocaleString('pt-BR')
                        : ''}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled
                    title="Rollback em breve"
                  >
                    Restaurar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
