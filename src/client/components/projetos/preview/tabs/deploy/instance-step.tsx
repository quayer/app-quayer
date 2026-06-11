"use client"

/**
 * InstanceStep — publish action UI + confirm dialog (step 3 of deploy wizard)
 *
 * Owns the button + AlertDialog. Actual async publish logic lives in
 * deploy-tab.tsx orchestrator; this component just wires user intent. O botão
 * Publicar é GATEADO por `allMet` (blockers do readiness) — coerente com o
 * copy do ConnectionStep ("não é possível publicar ainda").
 */

import { Rocket, X } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/client/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/client/components/ui/tooltip"
import type { ChecklistItem } from "./connection-step"
import type { PromptVersion, Tokens } from "./deploy-status-card"

interface InstanceStepProps {
  tokens: Tokens
  draft: PromptVersion | null
  production: PromptVersion | null
  publishing: boolean
  publishAsDraft: boolean
  confirmOpen: boolean
  allMet: boolean
  unmetItems: ChecklistItem[]
  onOpenConfirm: (asDraft: boolean) => void
  onConfirmChange: (open: boolean) => void
  onPublish: () => void
}

export function InstanceStep({
  tokens,
  draft,
  production,
  publishing,
  publishAsDraft,
  confirmOpen,
  allMet,
  unmetItems,
  onOpenConfirm,
  onConfirmChange,
  onPublish,
}: InstanceStepProps) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Gate único: publicar exige TODOS os pré-requisitos do
                  readiness (plan/byok/agent/prompt/version/channel) — mesma
                  política do copy "não é possível publicar ainda". */}
              <button
                type="button"
                disabled={!draft || publishing || !allMet}
                onClick={() => onOpenConfirm(false)}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30 sm:w-auto sm:px-8"
                style={{
                  backgroundColor: tokens.brand,
                  color: tokens.textInverse,
                  boxShadow:
                    draft && allMet && !publishing
                      ? "0 4px 14px -4px rgba(255,214,10,0.45)"
                      : "none",
                }}
              >
                <Rocket className="h-3.5 w-3.5" />
                {publishing
                  ? "Publicando..."
                  : draft
                    ? `Publicar v${draft.versionNumber}`
                    : "Sem rascunho para publicar"}
              </button>
            </TooltipTrigger>
            {!allMet && draft && (
              <TooltipContent
                side="bottom"
                className="max-w-[260px] p-3"
              >
                <p className="mb-1.5 text-[11px] font-semibold">
                  Requisitos pendentes:
                </p>
                <ul className="space-y-1">
                  {unmetItems.map((item) => (
                    <li
                      key={item.key}
                      className="flex items-center gap-1.5 text-[11px]"
                    >
                      <X
                        className="h-3 w-3 shrink-0"
                        style={{ color: tokens.danger }}
                      />
                      {item.label}
                    </li>
                  ))}
                </ul>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {draft && (
          <button
            type="button"
            disabled={publishing}
            onClick={() => onOpenConfirm(true)}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-4 text-[12px] font-medium transition-colors hover:opacity-80 disabled:opacity-30 sm:w-auto"
            style={{
              borderColor: tokens.border,
              color: tokens.textSecondary,
              backgroundColor: "transparent",
            }}
          >
            Manter como rascunho
          </button>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={onConfirmChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {publishAsDraft
                ? `Manter v${draft?.versionNumber} como rascunho?`
                : `Publicar v${draft?.versionNumber}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {publishAsDraft ? (
                <>
                  Nada será publicado agora. A versão continua salva como
                  rascunho e você pode publicá-la quando quiser.
                </>
              ) : (
                <>
                  Conversas em andamento continuam com v
                  {production?.versionNumber ?? "\u2014"} até terminarem. Novas
                  conversas começam na versão publicada.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                onPublish()
              }}
              disabled={publishing}
            >
              {publishing
                ? "Publicando..."
                : publishAsDraft
                  ? "Manter rascunho"
                  : "Publicar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
