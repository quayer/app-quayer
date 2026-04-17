import { useCallback } from "react"
import { toast } from "sonner"

interface UsePromptActionsResult {
  handleCopy: () => Promise<void>
  handleRegenerate: () => void
}

/**
 * Shared actions for prompt editor: copy to clipboard + regenerate via Builder.
 */
export function usePromptActions(value: string): UsePromptActionsResult {
  const handleCopy = useCallback(async () => {
    if (!value) {
      toast.info("Nenhum prompt para copiar")
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Prompt copiado para a area de transferencia")
    } catch {
      toast.error("Falha ao copiar. Tente novamente.")
    }
  }, [value])

  const handleRegenerate = useCallback(() => {
    toast.info("Va para o chat e peca ao Builder para regenerar o prompt")
    window.dispatchEvent(
      new CustomEvent("builder:focus-chat", {
        detail: { message: "Regenere o prompt do agente com melhorias" },
      })
    )
  }, [])

  return { handleCopy, handleRegenerate }
}
