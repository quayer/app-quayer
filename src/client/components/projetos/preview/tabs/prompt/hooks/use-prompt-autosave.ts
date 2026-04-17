import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "@/igniter.client"
import type { SaveState } from "../prompt-types"

interface UsePromptAutosaveOptions {
  /** Called after a successful save with the server-confirmed updatedAt timestamp. */
  onSave?: (updatedAt: Date) => void
}

interface UsePromptAutosaveResult {
  saveState: SaveState
  /** Current Date.now() snapshot, updated 1s while state is "saved". Use instead of calling Date.now() during render. */
  now: number
}

/**
 * Debounced auto-save state for prompt editor.
 * 2s debounce window. Exposes `tick` as a 1s re-render pulse
 * so consumers can render "salvo ha Ns" without extra state.
 *
 * @param value   Current editor value.
 * @param initial Value at mount time (used to detect dirty state).
 * @param projectId  Builder project UUID — the PATCH target. Pass `null` to skip saves (e.g. agent not yet created).
 * @param options Optional callbacks (onSave).
 */
export function usePromptAutosave(
  value: string,
  initial: string,
  projectId: string | null,
  options?: UsePromptAutosaveOptions,
): UsePromptAutosaveResult {
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" })
  const [now, setNow] = useState<number>(() => Date.now())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- auto-save debounce ---
  useEffect(() => {
    if (value === initial) return

    if (timerRef.current) clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- immediate "saving" indicator while 2s debounce is pending; derivation via isDirty would work but is owned by consumers, breaking encapsulation
    setSaveState({ kind: "saving" })

    timerRef.current = setTimeout(async () => {
      // If no projectId (agent not yet created by Builder), stay in saving
      // state briefly then quietly reset — do not show error for an expected condition.
      if (!projectId) {
        setSaveState({ kind: "idle" })
        return
      }

      try {
        const result = await (api.builder.updatePrompt as unknown as {
          mutate: (args: {
            params: { id: string }
            body: { systemPrompt: string }
          }) => Promise<{
            data?: { id: string; systemPrompt: string | null; updatedAt: string }
          }>
        }).mutate({
          params: { id: projectId },
          body: { systemPrompt: value },
        })

        const updatedAt = result?.data?.updatedAt
          ? new Date(result.data.updatedAt)
          : new Date()

        setSaveState({ kind: "saved", at: updatedAt.getTime() })
        options?.onSave?.(updatedAt)
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Erro ao salvar prompt"
        setSaveState({ kind: "error", message })
        toast.error(`Falha ao salvar prompt: ${message}`)
      }
    }, 2000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, initial, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- saved-ago ticker ---
  useEffect(() => {
    if (saveState.kind !== "saved") return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [saveState.kind])

  return { saveState, now }
}
