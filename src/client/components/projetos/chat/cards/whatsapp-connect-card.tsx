"use client"

/**
 * Builder Cards — whatsapp_connect (Jornada v2, T47 + T108, FR-15/27/30/34)
 *
 * ACTIVE-STEP card da fase "Lançar". POLIMÓRFICO por `channel.whatsappMode`
 * (plan §4.1) — apenas DESPACHA por modo; toda a lógica vive nos sub-componentes:
 *
 *  - `cloud` → embrulha o fluxo de credenciais Cloud API EXISTENTE
 *    (`ChannelCredentialForm` → POST /builder/channel/credentials). Nenhum QR é
 *    provisionado.
 *  - `qr` (default) → `WhatsAppQrConnect` (`./whatsapp-connect-qr`): provision 1x
 *    idempotente + QR + "Gerar novamente" (refresh-qr, throttle 30s) + share
 *    delegável (FR-34) + teto de polling (FR-27).
 *
 * CONCLUSÃO por AUTODETECÇÃO server-side: o passo conclui quando
 * `hasConnectedWhatsAppInstance` fica true (engine v2) e o polling unificado
 * (T51) re-renderiza este card. FR-30 (NUNCA regride): o sentinel
 * `whatsappConnectedOnce` mantém o passo concluído para sempre — queda posterior
 * vira banner de aviso (T100), não passo reaberto. O card não submete nada para
 * concluir. Reusa o visual de `chat/whatsapp-qr-card.tsx` (que permanece para o
 * tool-result inline legado v1).
 *
 * Contract: specs/jornada-builder-v2/plan.md §3.6/§4.1 + spec.md (FR-15/27/30/34).
 */

import * as React from "react"
import { Building2 } from "lucide-react"

import {
  ChannelCredentialForm,
  type ChannelCredentialField,
} from "@/client/components/projetos/preview/tabs/deploy/channel-credential-form"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"
import { WhatsAppQrConnect } from "./whatsapp-connect-qr"

/** Campos do WhatsApp Cloud API (espelho do deploy-tab; contrato channel/credentials). */
const WHATSAPP_CLOUD_FIELDS: readonly ChannelCredentialField[] = [
  {
    name: "accessToken",
    label: "Access Token",
    placeholder: "EAAB...",
    secret: true,
    minLength: 20,
    hint: "Token permanente da System User da Meta.",
  },
  {
    name: "phoneNumberId",
    label: "Phone Number ID",
    placeholder: "1099...",
    hint: "ID do número no WhatsApp Manager.",
  },
  { name: "wabaId", label: "WABA ID", placeholder: "1023..." },
  {
    name: "verifyToken",
    label: "Verify Token",
    placeholder: "string-secreta-do-webhook",
    hint: "O mesmo valor configurado no webhook da Meta.",
  },
] as const

/**
 * WhatsAppConnectCard — despacha o step `whatsapp_connect` por
 * `channel.whatsappMode` (default `qr`). O QR (incluindo share + teto) vive em
 * `WhatsAppQrConnect`; este componente só renderiza o caminho `cloud` inline.
 */
export function WhatsAppConnectCard({
  projectId,
  value,
  disabled = false,
  pollingExhausted,
  onRearmPolling,
  tokens,
}: CardComponentProps) {
  // FR-30: concluído NUNCA regride — o sentinel persiste o "conectou uma vez".
  const connected = value.confirmations.whatsappConnectedOnce === true

  if ((value.channel?.whatsappMode ?? "qr") === "cloud") {
    return (
      <CardShell
        icon={<Building2 className="h-4 w-4" />}
        title="WhatsApp oficial da Meta"
        reason="Cole as credenciais da sua conta WhatsApp Business API para conectar o número oficial."
        tokens={tokens}
      >
        <ChannelCredentialForm
          tokens={tokens}
          projectId={projectId}
          kind="WHATSAPP_CLOUD"
          fields={WHATSAPP_CLOUD_FIELDS}
          submitLabel="Conectar WhatsApp Cloud"
          onConnected={() => {
            /* a conexão real é confirmada por autodetecção do readiness (T51) */
          }}
        />
      </CardShell>
    )
  }

  return (
    <WhatsAppQrConnect
      projectId={projectId}
      connected={connected}
      disabled={disabled}
      pollingExhausted={pollingExhausted}
      onRearmPolling={onRearmPolling}
      tokens={tokens}
    />
  )
}

export default WhatsAppConnectCard
