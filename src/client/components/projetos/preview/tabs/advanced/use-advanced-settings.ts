"use client"

/**
 * Estado das configurações avançadas do runtime com proteção de edições não
 * salvas (dirty state):
 *
 *  - o reset vindo de `project.runtimeSettings` (ex.: router.refresh disparado
 *    pelo chat do Builder em create_agent/create_whatsapp_instance) só acontece
 *    quando NÃO há edição pendente;
 *  - rascunho persistido em sessionStorage — trocar de aba (que desmonta o
 *    componente, TabsContent sem forceMount) não descarta as edições;
 *  - `beforeunload` pede confirmação do navegador em refresh/fechamento com
 *    edições pendentes.
 */

import * as React from "react"
import { toast } from "sonner"
import { getCsrfHeaders } from "@/client/hooks/use-csrf-token"
import {
  DEFAULT_AGENT_RUNTIME_SETTINGS,
  type AgentRuntimeSettings,
} from "@/lib/agent-runtime-settings"

export function cloneSettings(settings: AgentRuntimeSettings): AgentRuntimeSettings {
  return JSON.parse(JSON.stringify(settings)) as AgentRuntimeSettings
}

export function mergeDefaults(
  settings: AgentRuntimeSettings | null | undefined,
): AgentRuntimeSettings {
  return {
    ...cloneSettings(DEFAULT_AGENT_RUNTIME_SETTINGS),
    ...(settings ?? {}),
    messageBuffer: {
      ...DEFAULT_AGENT_RUNTIME_SETTINGS.messageBuffer,
      ...(settings?.messageBuffer ?? {}),
    },
    media: {
      ...DEFAULT_AGENT_RUNTIME_SETTINGS.media,
      ...(settings?.media ?? {}),
    },
    tts: {
      ...DEFAULT_AGENT_RUNTIME_SETTINGS.tts,
      ...(settings?.tts ?? {}),
    },
  }
}

function draftStorageKey(projectId: string): string {
  return `builder:advanced-settings-draft:${projectId}`
}

function readDraft(projectId: string): AgentRuntimeSettings | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(draftStorageKey(projectId))
    if (!raw) return null
    return mergeDefaults(JSON.parse(raw) as AgentRuntimeSettings)
  } catch {
    return null
  }
}

export interface UseAdvancedSettingsResult {
  settings: AgentRuntimeSettings
  /** Há edições locais ainda não salvas no servidor. */
  dirty: boolean
  saving: boolean
  update: (recipe: (draft: AgentRuntimeSettings) => void) => void
  save: () => Promise<void>
}

export function useAdvancedSettings(
  projectId: string,
  runtimeSettings: AgentRuntimeSettings,
): UseAdvancedSettingsResult {
  // Baseline = último estado SALVO conhecido (prop do server ou resposta do PATCH).
  const [saved, setSaved] = React.useState<AgentRuntimeSettings>(() =>
    mergeDefaults(runtimeSettings),
  )
  const [settings, setSettings] = React.useState<AgentRuntimeSettings>(() =>
    mergeDefaults(runtimeSettings),
  )
  const [saving, setSaving] = React.useState(false)

  const dirty = React.useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(saved),
    [settings, saved],
  )
  // Espelho do dirty lido pelo effect de reset (sem escrever ref no render).
  const dirtyRef = React.useRef(false)
  React.useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  // Mount: restaura rascunho da troca de aba. Updates seguintes (router.refresh
  // muda a identidade de runtimeSettings): só resetam quando NÃO há edição.
  const initializedRef = React.useRef(false)
  React.useEffect(() => {
    const next = mergeDefaults(runtimeSettings)
    if (!initializedRef.current) {
      initializedRef.current = true
      setSaved(next)
      const draft = readDraft(projectId)
      if (draft) setSettings(draft)
      return
    }
    if (dirtyRef.current) return
    setSaved(next)
    setSettings(cloneSettings(next))
  }, [runtimeSettings, projectId])

  // Persiste/limpa o rascunho — sobrevive ao desmonte na troca de aba.
  React.useEffect(() => {
    try {
      const key = draftStorageKey(projectId)
      if (dirty) sessionStorage.setItem(key, JSON.stringify(settings))
      else sessionStorage.removeItem(key)
    } catch {
      // sessionStorage indisponível — segue sem rascunho
    }
  }, [dirty, settings, projectId])

  // Confirmação do navegador em refresh/fechamento com edições pendentes.
  React.useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  const update = React.useCallback(
    (recipe: (draft: AgentRuntimeSettings) => void) => {
      setSettings((current) => {
        const next = cloneSettings(current)
        recipe(next)
        return next
      })
    },
    [],
  )

  const save = React.useCallback(async () => {
    setSaving(true)
    try {
      const response = await fetch(
        `/api/v1/builder/projects/${projectId}/agent-settings`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            ...getCsrfHeaders(),
          },
          body: JSON.stringify(settings),
        },
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          message?: string
          error?: string
        }
        throw new Error(body.message || body.error || `Erro ${response.status}`)
      }

      const body = (await response.json()) as { data?: AgentRuntimeSettings }
      const persisted = mergeDefaults(body.data ?? settings)
      setSaved(persisted)
      setSettings(cloneSettings(persisted))
      toast.success("Configurações salvas")
    } catch (err) {
      toast.error((err as Error).message || "Erro ao salvar configurações")
    } finally {
      setSaving(false)
    }
  }, [projectId, settings])

  return { settings, dirty, saving, update, save }
}
