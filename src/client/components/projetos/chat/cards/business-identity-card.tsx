"use client"

/**
 * Builder Cards — business_identity (Jornada v2 · T38, FR-03)
 *
 * Caminho ALTERNATIVO ao accept do `source_progress`: quando o usuário NÃO cola
 * um site/Instagram, ele conta rápido sobre o negócio aqui. Captura o nome
 * (obrigatório — espelha `project.name`/`builder_projects.name`), o endereço
 * (opcional) e uma descrição curta (opcional, 1-2 frases). É o step ativo da
 * fase "Conhecer" num projeto v2 sem fonte.
 *
 * Prefill por exceção (idiom da jornada v2): nome cai para `value.project.name`,
 * endereço/descrição para `value.identity.*`. Quando tudo está vazio, o
 * formulário abre em branco com um hint ("Sem site? Conte rápido sobre o
 * negócio."). O usuário edita só o que precisa.
 *
 * Presentational only: lê seu slice de `props.value` e dispara o payload tipado
 * via `props.onSubmit` (chat-panel owns POST + SSE — o card NUNCA faz fetch).
 * Token-driven via `tokens` (zero cor hard-coded). Copy PT-BR.
 *
 * Contract (CARD CONTRACTS): cardKey 'business_identity'
 *   payload  → { cardKey: 'business_identity', name, address?, description? }
 *   owns     → identity.* (address, description) + espelha project.name
 *   sentinel → confirmations.businessIdentity
 */

import * as React from "react"
import { Check, Store } from "lucide-react"

import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import { Textarea } from "@/client/components/ui/textarea"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

/** Server-side clamps (espelha businessIdentityPayloadSchema em card-submit.schemas.ts). */
const NAME_MAX = 80
const ADDRESS_MAX = 300
const DESCRIPTION_MAX = 500

/** EXACT submit payload for cardKey 'business_identity'. */
export interface BusinessIdentityPayload {
  cardKey: "business_identity"
  name: string
  address?: string
  description?: string
}

/** Trim a field to undefined when empty so we never submit blank optionals. */
function clean(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * BusinessIdentityCard — formulário curto de identidade do negócio.
 *
 * Pré-preenche por exceção: `name` cai para `value.project.name`,
 * `address`/`description` lêem `value.identity.*`. Vazio em tudo = formulário em
 * branco com hint. Confirmar só habilita com nome preenchido (espelha o
 * `name: min(1)` do schema). Desabilitado enquanto o chat está streamando.
 */
export function BusinessIdentityCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<BusinessIdentityPayload>) {
  const [name, setName] = React.useState(value.project.name ?? "")
  const [address, setAddress] = React.useState(value.identity.address ?? "")
  const [description, setDescription] = React.useState(
    value.identity.description ?? "",
  )

  // Nenhum campo prefillado → formulário em branco: surfa o hint que convida o
  // usuário a contar rápido sobre o negócio (caminho sem fonte).
  const isBlank =
    name.trim().length === 0 &&
    address.trim().length === 0 &&
    description.trim().length === 0

  // O nome é obrigatório (espelha `name: min(1)` no schema) — nunca confirma uma
  // identidade sem nome.
  const canConfirm = clean(name) !== undefined

  const handleConfirm = React.useCallback(() => {
    if (disabled || clean(name) === undefined) return
    onSubmit({
      cardKey: "business_identity",
      name: name.trim(),
      address: clean(address),
      description: clean(description),
    })
  }, [address, description, disabled, name, onSubmit])

  return (
    <CardShell
      tokens={tokens}
      icon={<Store className="h-4 w-4" />}
      title="Conte sobre o negócio"
      reason={
        isBlank
          ? "Sem site? Conte rápido sobre o negócio. Só o nome já basta — endereço e descrição são opcionais."
          : "Confira os dados do negócio. Ajuste o que precisar — só o nome é obrigatório."
      }
      actions={[
        {
          label: "Confirmar negócio",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled: disabled || !canConfirm,
        },
      ]}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="business-identity-name"
            className="text-[12px] font-medium"
            style={{ color: tokens.textSecondary }}
          >
            Nome do negócio
          </Label>
          <Input
            id="business-identity-name"
            value={name}
            disabled={disabled}
            maxLength={NAME_MAX}
            placeholder="Ex.: Clínica Aurora"
            onChange={(event) => setName(event.target.value)}
            className="text-[13px]"
            style={{
              backgroundColor: tokens.bgBase,
              borderColor: tokens.divider,
              color: tokens.textPrimary,
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="business-identity-address"
            className="text-[12px] font-medium"
            style={{ color: tokens.textSecondary }}
          >
            Endereço{" "}
            <span style={{ color: tokens.textTertiary }}>(opcional)</span>
          </Label>
          <Input
            id="business-identity-address"
            value={address}
            disabled={disabled}
            maxLength={ADDRESS_MAX}
            placeholder="Ex.: Rua das Flores, 123 — Centro, São Paulo/SP"
            onChange={(event) => setAddress(event.target.value)}
            className="text-[13px]"
            style={{
              backgroundColor: tokens.bgBase,
              borderColor: tokens.divider,
              color: tokens.textPrimary,
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="business-identity-description"
            className="text-[12px] font-medium"
            style={{ color: tokens.textSecondary }}
          >
            Descrição{" "}
            <span style={{ color: tokens.textTertiary }}>(opcional)</span>
          </Label>
          <Textarea
            id="business-identity-description"
            value={description}
            disabled={disabled}
            maxLength={DESCRIPTION_MAX}
            placeholder="Em 1-2 frases: o que o negócio faz e para quem."
            onChange={(event) => setDescription(event.target.value)}
            className="min-h-[64px] text-[13px]"
            style={{
              backgroundColor: tokens.bgBase,
              borderColor: tokens.divider,
              color: tokens.textPrimary,
            }}
          />
        </div>
      </div>
    </CardShell>
  )
}

export default BusinessIdentityCard
