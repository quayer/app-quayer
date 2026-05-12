"use client"

import { Building2 } from "lucide-react"
import { useAppTokens, type AppTokens } from "@/client/hooks/use-app-tokens"
import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import { Button } from "@/client/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/client/components/ui/tooltip"

export interface OrgSettingsData {
  id: string
  name: string
  slug: string
  document: string | null
  type: "pf" | "pj"
  maxInstances: number
  maxUsers: number
  billingType: "free" | "basic" | "pro"
  isActive: boolean
  createdAt: string
}

const BILLING_LABELS: Record<OrgSettingsData["billingType"], string> = {
  free: "Free",
  basic: "Basic",
  pro: "Pro",
}

function Pill({
  children,
  tokens,
  tone = "brand",
}: {
  children: React.ReactNode
  tokens: AppTokens
  tone?: "brand" | "neutral" | "success" | "muted"
}) {
  const palette = (() => {
    if (tone === "brand") {
      return { bg: tokens.brandSubtle, color: tokens.brand, border: tokens.brandBorder }
    }
    if (tone === "success") {
      return { bg: tokens.brandSubtle, color: tokens.brand, border: tokens.brandBorder }
    }
    if (tone === "muted") {
      return { bg: tokens.bgElevated, color: tokens.textTertiary, border: tokens.divider }
    }
    return { bg: tokens.bgElevated, color: tokens.textSecondary, border: tokens.divider }
  })()

  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: palette.bg,
        color: palette.color,
        borderColor: palette.border,
      }}
    >
      {children}
    </span>
  )
}

function Field({
  label,
  hint,
  children,
  tokens,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  tokens: AppTokens
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[12px] font-semibold" style={{ color: tokens.textSecondary }}>
        {label}
      </Label>
      {children}
      {hint ? (
        <p className="text-[11px]" style={{ color: tokens.textTertiary }}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function OrgSettingsForm({ data }: { data: OrgSettingsData }) {
  const { tokens } = useAppTokens()

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: tokens.brandSubtle, color: tokens.brand }}
          >
            <Building2 className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <h1
              className="text-xl font-semibold tracking-tight"
              style={{ color: tokens.textPrimary }}
            >
              Configurações da Organização
            </h1>
            <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
              Dados gerais da sua organização ativa.
            </p>
          </div>
        </div>

        {/* Form card */}
        <div
          className="rounded-xl border p-6"
          style={{ backgroundColor: tokens.bgSurface, borderColor: tokens.border }}
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="Nome" tokens={tokens}>
              <Input value={data.name} disabled readOnly />
            </Field>

            <Field
              label="Slug"
              hint="Identificador único, não pode ser alterado"
              tokens={tokens}
            >
              <Input value={data.slug} disabled readOnly />
            </Field>

            <Field label="Documento (CPF/CNPJ)" tokens={tokens}>
              <Input value={data.document ?? ""} disabled readOnly placeholder="—" />
            </Field>

            <Field label="Tipo" tokens={tokens}>
              <div className="flex h-9 items-center">
                <Pill tokens={tokens} tone="neutral">
                  {data.type === "pj" ? "PJ" : "PF"}
                </Pill>
              </div>
            </Field>

            <Field label="Plano" tokens={tokens}>
              <div className="flex h-9 items-center">
                <Pill tokens={tokens} tone="brand">
                  {BILLING_LABELS[data.billingType]}
                </Pill>
              </div>
            </Field>

            <Field label="Status" tokens={tokens}>
              <div className="flex h-9 items-center">
                <Pill tokens={tokens} tone={data.isActive ? "success" : "muted"}>
                  {data.isActive ? "Ativa" : "Inativa"}
                </Pill>
              </div>
            </Field>

            <Field label="Limite de canais" tokens={tokens}>
              <Input value={`${data.maxInstances} canais`} disabled readOnly />
            </Field>

            <Field label="Limite de usuários" tokens={tokens}>
              <Input value={`${data.maxUsers} usuários`} disabled readOnly />
            </Field>
          </div>

          {/* Actions */}
          <div
            className="mt-6 flex items-center justify-end gap-3 border-t pt-4"
            style={{ borderColor: tokens.divider }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button disabled>Salvar</Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Em breve</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
