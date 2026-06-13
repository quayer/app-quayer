"use client"

/**
 * Builder Cards — instagram_connect (Jornada v2 · T97, FR-24/25)
 *
 * Card CONDICIONAL da fase "Lançar": surfa como step ativo `instagram_connect`
 * só quando `channel.platforms` inclui `'instagram'` (o engine v2 / journey-v2.ts
 * decide; aqui apenas guardamos defensivamente). Diferente do WhatsApp, o
 * Instagram NÃO tem nível 2 (FR-25) — só o caminho oficial de credenciais Meta.
 *
 * REUSO sem duplicar formulário (critério da T97): este card EMBRULHA o caminho
 * oficial EXISTENTE de credenciais IG renderizando o `ChannelCredentialForm`
 * (kind="INSTAGRAM"), o MESMO componente que o wizard de deploy usa. A form POSTa
 * direto para `POST /api/v1/builder/channel/credentials` (contrato em
 * channel-credentials.{routes,contract}.ts) — este card não redefine campos de
 * submit nem reimplementa o POST; só fornece o MANIFESTO de campos (UI config) e
 * a copy sem jargão.
 *
 * AUTODETECÇÃO de conexão (sem card-submit próprio): `instagram_connect` NÃO é um
 * cardKey de submit — o passo é resolvido server-side por
 * `ctx.hasConnectedInstagramInstance` no readiness (readiness-resolver.ts). Salvar
 * credenciais manuais válidas é a prova técnica neste fluxo: a rota grava a
 * Connection como CONNECTED e o polling de readiness do workspace (T51) deixa de
 * surfar este card. Por isso o card NÃO chama `onSubmit` (não há sentinel para
 * flipar): após salvar, mostra um estado local de "conectado" enquanto o polling
 * converge.
 *
 * Presentational + token-driven; copy PT-BR; benefício antes da tecnologia.
 *
 * Contract: specs/jornada-builder-v2/spec.md (FR-24/25) +
 *           src/server/ai-module/builder/channel/channel-credentials.contract.ts.
 */

import * as React from "react"
import { Instagram } from "lucide-react"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"
import {
  ChannelCredentialForm,
  type ChannelCredentialField,
} from "@/client/components/projetos/preview/tabs/deploy/channel-credential-form"

/**
 * Payload do card. `instagram_connect` não tem submit próprio (a conexão é
 * autodetectada pelo readiness), então o payload é vazio — o card embrulha a
 * `ChannelCredentialForm`, que POSTa direto no caminho oficial de credenciais.
 */
export type InstagramConnectPayload = Record<string, never>

/**
 * Manifesto dos campos da credencial IG consumidos pela `ChannelCredentialForm`.
 * Espelha o spec do wizard de deploy (channel-selector-card) e o
 * `instagramCredentialsSchema` do contrato — é configuração de UI, não lógica de
 * submit (a form é 100% reusada). Mantido alinhado ao backend (igAccountId,
 * pageAccessToken, appSecret, verifyToken).
 */
const INSTAGRAM_FIELDS: readonly ChannelCredentialField[] = [
  { name: "igAccountId", label: "Instagram Account ID", placeholder: "17841..." },
  {
    name: "pageAccessToken",
    label: "Page Access Token",
    placeholder: "EAAB...",
    secret: true,
    minLength: 20,
  },
  { name: "appSecret", label: "App Secret", placeholder: "32 caracteres", secret: true },
  {
    name: "verifyToken",
    label: "Verify Token",
    placeholder: "string-secreta-do-webhook",
    hint: "O mesmo valor configurado no webhook da Meta.",
  },
] as const

/**
 * InstagramConnectCard — passo de conexão do Instagram (sem nível 2, FR-25).
 *
 * Surfa só quando o canal Instagram foi escolhido no card `channel_platform`
 * (guard defensivo por `value.channel?.platforms`). Embrulha o fluxo oficial de
 * credenciais Meta sem reimplementar o formulário; a conexão é confirmada por
 * autodetecção do readiness, então o card só fornece a form + o estado honesto de
 * "conectando…" depois que as credenciais são salvas.
 */
export function InstagramConnectCard({
  projectId,
  value,
  tokens,
}: CardComponentProps<InstagramConnectPayload>) {
  // Guard defensivo: o engine v2 só surfa este step quando o IG foi selecionado,
  // mas se o card chegar à tela sem o canal escolhido (reabertura/estado legado)
  // não há o que conectar — não renderiza nada.
  const platforms = value.channel?.platforms
  const instagramSelected = platforms?.includes("instagram") ?? false

  // Salvar credenciais cria/atualiza a Connection como CONNECTED; a conclusão
  // da jornada vem por autodetecção do readiness no próximo polling.
  const [credentialsSaved, setCredentialsSaved] = React.useState(false)

  const handleConnected = React.useCallback(() => {
    setCredentialsSaved(true)
  }, [])

  if (!instagramSelected) return null

  return (
    <CardShell
      tokens={tokens}
      icon={<Instagram className="h-4 w-4" />}
      title="Conectar o Instagram"
      reason={
        credentialsSaved
          ? "Credenciais salvas. O Instagram foi conectado e o agente passa a responder as DMs automaticamente. Isto atualiza sozinho."
          : "Cole as credenciais do app da Meta para que o agente responda as DMs do seu Instagram automaticamente. É o caminho oficial — os dados ficam guardados com segurança."
      }
    >
      <ChannelCredentialForm
        tokens={tokens}
        projectId={projectId}
        kind="INSTAGRAM"
        fields={INSTAGRAM_FIELDS}
        submitLabel="Conectar Instagram"
        onConnected={handleConnected}
      />
      {!credentialsSaved && (
        <p
          className="mt-3 text-[11px] leading-relaxed"
          style={{ color: tokens.textTertiary }}
        >
          Não tem essas credenciais ainda? Elas vêm do app da Meta vinculado ao seu
          perfil profissional — você só precisa fazer isto uma vez.
        </p>
      )}
    </CardShell>
  )
}

export default InstagramConnectCard
