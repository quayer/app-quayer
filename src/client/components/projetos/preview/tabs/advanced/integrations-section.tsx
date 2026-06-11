"use client"

/**
 * Integration Builder — panel section (Wave 1, T36)
 *
 * Self-contained surface for the AdvancedTab: lists the project's integrations,
 * opens the template picker (T37) to add new ones, and drives the per-item
 * lifecycle actions (Testar / Pausar / Retomar / Editar credenciais / Remover)
 * through `useIntegrations`. Re-hostable in the v2 Capacidades surface — it
 * takes only `{ projectId }` plus optional callbacks.
 *
 * FLAG GATE (load-bearing): the section renders NOTHING when the Integration
 * Builder flag is off. The clean per-org seed required by
 * `isIntegrationBuilderEnabled` is not reachable client-side here (the
 * WorkspaceProject wire contract carries no organizationId), so we gate on the
 * public env flag `NEXT_PUBLIC_INTEGRATION_BUILDER` evaluated as an on/off
 * switch — mirroring how `turnstile-widget.tsx` reads a `NEXT_PUBLIC_*` value
 * directly. LIMITATION: percentage rollout cannot be resolved client-side from
 * this surface, so `percentage:N` is treated as ON here; the authoritative
 * per-org gate stays on the server routes.
 *
 * Themed 100% via `useAppTokens()`. Copy in PT-BR. Zero `any`.
 */

import * as React from "react"
import { AlertTriangle, Pause, Play, Plus, RefreshCw, Trash2, Wrench } from "lucide-react"

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
import { Badge } from "@/client/components/ui/badge"
import { Button } from "@/client/components/ui/button"
import { Skeleton } from "@/client/components/ui/skeleton"
import { useAppTokens, type AppTokens } from "@/client/hooks/use-app-tokens"
import { SectionTitle } from "./advanced-controls"
import { IntegrationCredentialsDialog } from "./integration-credentials-dialog"
import { IntegrationTemplatePicker } from "./integration-template-picker"
import { useIntegrations, type IntegrationListItem } from "./use-integrations"

export interface IntegrationsSectionProps {
  projectId: string
  /** Optional hook for re-hosting telemetry/analytics; fired on add open. */
  onAddIntegration?: () => void
}

/** Flag check: env is an on/off switch client-side (see file header). */
function isFlagEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_INTEGRATION_BUILDER ?? "off").trim()
  return raw !== "off"
}

/** pt-BR label + token keys for each FR-07 status (bg / fg / border). */
const STATUS_META: Record<
  string,
  { label: string; bg: keyof AppTokens; fg: keyof AppTokens; bd: keyof AppTokens }
> = {
  draft: { label: "Rascunho", bg: "bgElevated", fg: "textSecondary", bd: "divider" },
  validated: { label: "Validada", bg: "brandSubtle", fg: "brandText", bd: "brandBorder" },
  active: { label: "Ativa", bg: "successSubtle", fg: "successText", bd: "success" },
  paused: { label: "Pausada", bg: "warningSubtle", fg: "warningText", bd: "warning" },
  error: { label: "Com erro", bg: "dangerSubtle", fg: "dangerText", bd: "danger" },
}

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const { tokens } = useAppTokens()
  const meta = STATUS_META[status] ?? STATUS_META.draft
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: tokens[meta.bg], color: tokens[meta.fg], borderColor: tokens[meta.bd] }}
    >
      {STATUS_META[status] ? meta.label : status}
    </span>
  )
}

/** Compact outline action button shared by the per-item row. */
function ActionButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ElementType
  label: string
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={disabled} onClick={onClick}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Button>
  )
}

export function IntegrationsSection({
  projectId,
  onAddIntegration,
}: IntegrationsSectionProps): React.JSX.Element | null {
  const { tokens } = useAppTokens()
  const {
    integrations,
    isLoading,
    error,
    refetch,
    templates,
    templatesLoading,
    createIntegration,
    updateCredentials,
    testIntegration,
    pause,
    resume,
    remove,
    isMutating,
  } = useIntegrations(projectId)

  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<IntegrationListItem | null>(null)
  const [pendingRemove, setPendingRemove] = React.useState<IntegrationListItem | null>(null)

  // Flag gate — hooks run unconditionally above so order stays stable.
  if (!isFlagEnabled()) return null

  const handleAdd = () => {
    onAddIntegration?.()
    setPickerOpen(true)
  }

  // After a draft is created, open its credentials dialog. We resolve the new
  // row from the (refetched) list by templateSlug — the freshest matching draft.
  const handleCreated = (templateSlug: string) => {
    const match = integrations.find(
      (item) => item.templateSlug === templateSlug && item.status === "draft",
    )
    if (match) setEditing(match)
  }

  const addButton = (
    <Button type="button" size="sm" className="gap-1.5" onClick={handleAdd}>
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      Integração
    </Button>
  )

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle title="Integrações" />
        {addButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : error ? (
        <div
          className="flex items-center justify-between gap-3 rounded-lg border p-3 text-[13px]"
          style={{ borderColor: tokens.danger, backgroundColor: tokens.dangerSubtle, color: tokens.dangerText }}
        >
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Não foi possível carregar as integrações.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : integrations.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center"
          style={{ borderColor: tokens.divider }}
        >
          <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
            Nenhuma integração ainda. Conecte seu agente a outros sistemas para
            automatizar ações no atendimento.
          </p>
          {addButton}
        </div>
      ) : (
        <ul className="space-y-2">
          {integrations.map((item) => {
            const isPaused = item.status === "paused"
            return (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium" style={{ color: tokens.textPrimary }}>
                      {item.displayName}
                    </span>
                    <StatusBadge status={item.status} />
                  </div>
                  {item.triggerDescription ? (
                    <p className="text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
                      {item.triggerDescription}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <ActionButton icon={RefreshCw} label="Testar" disabled={isMutating} onClick={() => void testIntegration(item.id)} />
                  {isPaused ? (
                    <ActionButton icon={Play} label="Retomar" disabled={isMutating} onClick={() => void resume(item.id)} />
                  ) : (
                    <ActionButton icon={Pause} label="Pausar" disabled={isMutating} onClick={() => void pause(item.id)} />
                  )}
                  <ActionButton icon={Wrench} label="Editar credenciais" disabled={isMutating} onClick={() => setEditing(item)} />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remover ${item.displayName}`}
                    disabled={isMutating}
                    onClick={() => setPendingRemove(item)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" style={{ color: tokens.dangerText }} />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <IntegrationTemplatePicker
        projectId={projectId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        templates={templates}
        templatesLoading={templatesLoading}
        createIntegration={createIntegration}
        onCreated={handleCreated}
      />

      <IntegrationCredentialsDialog
        integration={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        updateCredentials={updateCredentials}
        testIntegration={testIntegration}
        isMutating={isMutating}
      />

      <AlertDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover integração?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemove
                ? `"${pendingRemove.displayName}" será removida e o agente deixará de usá-la. Esta ação não pode ser desfeita.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isMutating}
              onClick={() => {
                if (pendingRemove) void remove(pendingRemove.id)
                setPendingRemove(null)
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

export default IntegrationsSection
