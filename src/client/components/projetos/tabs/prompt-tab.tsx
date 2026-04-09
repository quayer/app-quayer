'use client'

/**
 * PromptTab — US-026
 *
 * System prompt editor with stubbed auto-save + placeholder version history.
 * Wire-up to the real prompt-versions endpoint is TODO.
 */

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { Textarea } from '@/client/components/ui/textarea'
import type { WorkspaceProject } from '@/client/components/projetos/types'

interface PromptTabProps {
  project: WorkspaceProject
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }

// TODO: replace hardcoded mock with GET /api/v1/builder/prompt-versions?agentId=...
const MOCK_VERSIONS: Array<{ id: string; version: number; label: string; at: string }> = [
  { id: 'v2', version: 2, label: 'Ajuste de tom formal', at: 'ha 2h' },
  { id: 'v1', version: 1, label: 'Versao inicial', at: 'ha 1d' },
]

export function PromptTab({ project }: PromptTabProps) {
  const initial = project.aiAgent?.systemPrompt ?? ''
  const [value, setValue] = useState(initial)
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const [tick, setTick] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stubbed auto-save: 2s after the last keystroke, flip to "saving" briefly,
  // then to "saved". TODO: wire to prompt-versions endpoint.
  useEffect(() => {
    if (value === initial) return
    if (timerRef.current) clearTimeout(timerRef.current)
    setSaveState({ kind: 'saving' })
    timerRef.current = setTimeout(() => {
      // TODO: POST /api/v1/builder/prompt-versions with { agentId, content }
      setSaveState({ kind: 'saved', at: Date.now() })
    }, 2000)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, initial])

  // Re-render once a second so the "ha Xs" label stays fresh.
  useEffect(() => {
    if (saveState.kind !== 'saved') return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [saveState.kind])

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

  const saveLabel = (() => {
    if (saveState.kind === 'saving') return 'salvando...'
    if (saveState.kind === 'saved') {
      const secs = Math.max(0, Math.floor((Date.now() - saveState.at) / 1000))
      // touch tick so react sees the dep
      void tick
      return `salvo ha ${secs}s`
    }
    return ''
  })()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Prompt do agente</h2>
          <p className="text-sm text-muted-foreground">
            Edite o prompt de sistema. Alteracoes sao salvas automaticamente.
          </p>
        </div>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {saveLabel}
        </span>
      </div>

      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Escreva o prompt de sistema do agente..."
        className="min-h-[320px] font-mono text-sm"
      />

      <div className="flex flex-wrap gap-2">
        <Button
          variant="default"
          onClick={() => {
            // TODO: POST /api/v1/builder/prompt-versions { agentId, content, checkpoint: true }
            console.log('[prompt-tab] salvar checkpoint stub', { agentId: project.aiAgent?.id })
          }}
        >
          Salvar checkpoint
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            // TODO: integrate with chat-panel via workspace callback
            console.log('[prompt-tab] continuar no chat stub')
          }}
        >
          Continuar no chat
        </Button>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium">Versoes anteriores</h3>
        {/* TODO: wire to GET /api/v1/builder/prompt-versions?agentId={id}&limit=10 */}
        <div className="flex flex-col gap-2">
          {MOCK_VERSIONS.map((v) => (
            <Card key={v.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="text-sm font-medium">v{v.version} — {v.label}</div>
                  <div className="text-xs text-muted-foreground">{v.at}</div>
                </div>
                <Button variant="ghost" size="sm" disabled>
                  Restaurar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
