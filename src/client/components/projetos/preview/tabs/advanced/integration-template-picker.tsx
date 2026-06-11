"use client"

/**
 * Integration Builder — template picker (Wave 1, T37)
 *
 * A Dialog listing the offerable `templates` from `useIntegrations`. Picking
 * one creates a draft integration (`createIntegration({ projectId,
 * templateSlug })`), closes the picker and hands the new draft's slug back via
 * `onCreated` so the parent can open the credentials dialog (T38) for it.
 *
 * Secondary affordance — "Não encontrou? Descreva no chat" — dispatches the
 * existing `builder:focus-chat` custom event (the same one the prompt tab's
 * "Regenerar" and `AskBuilderButton` use) with a pre-filled message. That
 * routes the user to the conversational/investigator flow that lands in Onda 2.
 *
 * Themed 100% via `useAppTokens()`. Copy in PT-BR. Zero `any`.
 */

import * as React from "react"
import { Loader2, MessageSquarePlus, Plug } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type {
  CreateIntegrationInput,
  IntegrationTemplateItem,
} from "./use-integrations"

export interface IntegrationTemplatePickerProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: IntegrationTemplateItem[]
  templatesLoading: boolean
  /** Creates the draft + AgentTool; resolves once the list is refetched. */
  createIntegration: (input: CreateIntegrationInput) => Promise<unknown>
  /** Called after a successful create with the chosen template slug. */
  onCreated?: (templateSlug: string) => void
}

const CHAT_PREFILL =
  "Quero integrar com outro sistema. Pode me ajudar a configurar essa integração?"

export function IntegrationTemplatePicker({
  projectId,
  open,
  onOpenChange,
  templates,
  templatesLoading,
  createIntegration,
  onCreated,
}: IntegrationTemplatePickerProps): React.JSX.Element {
  const { tokens } = useAppTokens()
  const [creatingSlug, setCreatingSlug] = React.useState<string | null>(null)

  const handlePick = React.useCallback(
    async (slug: string) => {
      if (creatingSlug) return
      setCreatingSlug(slug)
      try {
        await createIntegration({ projectId, templateSlug: slug })
        onOpenChange(false)
        onCreated?.(slug)
      } finally {
        setCreatingSlug(null)
      }
    },
    [creatingSlug, createIntegration, projectId, onOpenChange, onCreated],
  )

  const handleAskChat = React.useCallback(() => {
    if (typeof window === "undefined") return
    window.dispatchEvent(
      new CustomEvent("builder:focus-chat", {
        detail: { message: CHAT_PREFILL },
      }),
    )
    onOpenChange(false)
  }, [onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar integração</DialogTitle>
          <DialogDescription>
            Escolha um conector pronto para conectar seu agente a outro sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {templatesLoading ? (
            <div className="flex items-center gap-2 py-6 text-[13px]" style={{ color: tokens.textSecondary }}>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Carregando conectores...
            </div>
          ) : templates.length === 0 ? (
            <p className="py-4 text-[13px]" style={{ color: tokens.textSecondary }}>
              Nenhum conector pronto no momento. Descreva no chat o que você
              precisa integrar.
            </p>
          ) : (
            templates.map((template) => {
              const busy = creatingSlug === template.slug
              return (
                <button
                  key={template.slug}
                  type="button"
                  onClick={() => handlePick(template.slug)}
                  disabled={Boolean(creatingSlug)}
                  className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}
                >
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: tokens.bgElevated, color: tokens.textSecondary }}
                    aria-hidden="true"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plug className="h-4 w-4" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium" style={{ color: tokens.textPrimary }}>
                      {template.displayName}
                    </span>
                    <span className="text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
                      {template.description}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="mt-1 border-t pt-3" style={{ borderColor: tokens.divider }}>
          <button
            type="button"
            onClick={handleAskChat}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors"
            style={{ color: tokens.brandText }}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
            Não encontrou? Descreva no chat
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default IntegrationTemplatePicker
