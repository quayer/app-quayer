"use client"

/**
 * InstanceStep — publish action UI + confirm dialog (step 2 of deploy wizard)
 *
 * Owns the button + AlertDialog. Actual async publish logic lives in
 * deploy-tab.tsx orchestrator; this component just wires user intent.
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
              <button
                type="button"
                disabled={!draft || publishing}
                onClick={() => onOpenConfirm(false)}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30 sm:w-auto sm:px-8"
                style={{
                  backgroundColor: tokens.brand,
                  color: tokens.textInverse,
                  boxShadow:
                    draft && !publishing
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
                      <X className="h-3 w-3 shrink-0 text-red-400" />
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
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-medium transition-colors hover:opacity-80 disabled:opacity-30 sm:w-auto sm:px-5"
            style={{
              borderColor: tokens.border,
              color: tokens.textSecondary,
              backgroundColor: "transparent",
            }}
          >
            Publicar como rascunho
          </button>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={onConfirmChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {publishAsDraft
                ? `Salvar v${draft?.versionNumber} como rascunho?`
                : `Publicar v${draft?.versionNumber}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {publishAsDraft ? (
                <>
                  A versao sera salva mas nao ativada em producao. Voce podera
                  publica-la posteriormente.
                </>
              ) : (
                <>
                  Conversas em andamento continuam com v
                  {production?.versionNumber ?? "\u2014"} ate terminarem. Novas
                  conversas comecam na versao publicada.
                  {!allMet && (
                    <span className="mt-2 block text-amber-500">
                      Atencao: nem todos os pre-requisitos foram atendidos.
                    </span>
                  )}
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
                  ? "Salvar rascunho"
                  : "Publicar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
