"use client"

export const RUN_REFINEMENT_MESSAGE = "Rode o refinamento do agente agora."

export function requestRefinementRun(onDraft?: (content: string) => void): void {
  if (typeof window === "undefined") {
    onDraft?.(RUN_REFINEMENT_MESSAGE)
    return
  }

  window.dispatchEvent(
    new CustomEvent("builder:focus-chat", {
      detail: { message: RUN_REFINEMENT_MESSAGE, autoSend: true },
    }),
  )
}
