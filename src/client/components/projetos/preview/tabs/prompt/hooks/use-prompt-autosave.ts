import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { SaveState } from "../prompt-types"

/** Snapshot do prompt confirmado pelo servidor (save ou conflito). */
export interface PromptServerState {
  systemPrompt: string
  /** ISO string; null quando o servidor não informou (defensivo). */
  updatedAt: string | null
}

interface UsePromptAutosaveOptions {
  /** Conteúdo atual do editor. */
  value: string
  /**
   * True somente quando `value` contém uma edição DO USUÁRIO ainda não
   * confirmada pelo servidor. Mudanças programáticas (sync de snapshot,
   * rollback, adoção de conflito) NUNCA devem deixar isto true — é o que
   * garante o autosave estritamente user-driven.
   */
  dirty: boolean
  /** Builder project UUID — alvo do PATCH. `null` pula saves (agente ausente). */
  projectId: string | null
  /** Save confirmado — o pai realinha o baseline do editor. */
  onSaved?: (saved: PromptServerState) => void
  /** 409: o prompt mudou no servidor desde o último save (regeneração/rollback/identidade). */
  onConflict?: (server: PromptServerState) => void
}

interface UsePromptAutosaveResult {
  saveState: SaveState
  /** Date.now() atualizado 1x/s enquanto "saved" — para render de "salvo há Ns". */
  now: number
  /** Reenvia o valor atual SEM precondição (banner de conflito: "Manter minha edição"). */
  forceSave: () => void
  /**
   * Realinha a precondição otimista após o pai adotar um estado vindo do
   * servidor por outro canal (rollback, snapshot RSC). Passe `null` quando o
   * updatedAt correspondente é desconhecido — o próximo save grava sem 409.
   */
  acceptServerState: (updatedAt: string | null) => void
}

interface PromptPatchEnvelope {
  data?: {
    id?: string
    systemPrompt?: string | null
    updatedAt?: string
  }
  message?: string
}

/**
 * Auto-save debounced (2s) do system prompt — estritamente user-driven.
 *
 * Usa fetch direto (mesmo padrão do antigo formulário de identidade) para poder tratar o 409 de
 * precondição com corpo: `baseUpdatedAt` viaja no PATCH e o servidor rejeita
 * quando o prompt mudou desde o último save, evitando sobrescrita silenciosa
 * de regenerações/rollbacks/disclosure.
 */
export function usePromptAutosave(
  options: UsePromptAutosaveOptions,
): UsePromptAutosaveResult {
  const { value, dirty, projectId } = options
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" })
  const [now, setNow] = useState<number>(() => Date.now())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** updatedAt do último save confirmado — precondição otimista do PATCH. */
  const baseUpdatedAtRef = useRef<string | null>(null)
  // Refs estáveis para callbacks/valor — evita re-agendar o debounce quando o
  // pai recria closures a cada render.
  const optionsRef = useRef(options)
  optionsRef.current = options

  const performSave = useCallback(
    async (content: string, withPrecondition: boolean) => {
      const id = optionsRef.current.projectId
      if (!id) {
        setSaveState({ kind: "idle" })
        return
      }

      try {
        const body: { systemPrompt: string; baseUpdatedAt?: string } = {
          systemPrompt: content,
        }
        if (withPrecondition && baseUpdatedAtRef.current) {
          body.baseUpdatedAt = baseUpdatedAtRef.current
        }

        const res = await fetch(`/api/v1/builder/projects/${id}/prompt`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })

        if (res.status === 409) {
          const json = (await res.json()) as PromptPatchEnvelope
          setSaveState({ kind: "idle" })
          optionsRef.current.onConflict?.({
            systemPrompt: json.data?.systemPrompt ?? "",
            updatedAt: json.data?.updatedAt ?? null,
          })
          return
        }

        if (!res.ok) {
          let message = `Erro ao salvar prompt (HTTP ${res.status})`
          try {
            const json = (await res.json()) as PromptPatchEnvelope
            if (json.message) message = json.message
          } catch {
            // corpo não-JSON — mantém a mensagem genérica
          }
          throw new Error(message)
        }

        const json = (await res.json()) as PromptPatchEnvelope
        const updatedAt = json.data?.updatedAt ?? null
        baseUpdatedAtRef.current = updatedAt
        setSaveState({ kind: "saved", at: Date.now() })
        optionsRef.current.onSaved?.({
          systemPrompt: json.data?.systemPrompt ?? content,
          updatedAt,
        })
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Erro ao salvar prompt"
        setSaveState({ kind: "error", message })
        toast.error(`Falha ao salvar prompt: ${message}`)
      }
    },
    [],
  )

  // --- auto-save debounce (apenas edições do usuário) ---
  useEffect(() => {
    if (!dirty) return

    if (timerRef.current) clearTimeout(timerRef.current)
    // Indicador imediato de "salvando" enquanto o debounce de 2s corre.
    setSaveState({ kind: "saving" })

    const content = value
    timerRef.current = setTimeout(() => {
      void performSave(content, true)
    }, 2000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, dirty, projectId, performSave])

  const forceSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setSaveState({ kind: "saving" })
    void performSave(optionsRef.current.value, false)
  }, [performSave])

  const acceptServerState = useCallback((updatedAt: string | null) => {
    baseUpdatedAtRef.current = updatedAt
  }, [])

  // --- saved-ago ticker ---
  useEffect(() => {
    if (saveState.kind !== "saved") return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [saveState.kind])

  return { saveState, now, forceSave, acceptServerState }
}
