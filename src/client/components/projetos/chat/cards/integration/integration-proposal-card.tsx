"use client"

/**
 * Integration Builder — integration_proposal card (Wave 2, T39)
 *
 * Card INLINE de proposta de integração externa: o meta-agente investigou uma
 * plataforma (ex.: "RD Station") e propõe conectá-la. O card explica EM LINGUAGEM
 * LEIGA o que a integração faz, quando o agente a usa e — em destaque (NFR-03,
 * transparência) — quais dados saem do WhatsApp do usuário para a plataforma.
 *
 * CONFIRM-ONLY (espelha `agent_approval`/`published_next_steps`): não há dado do
 * cliente para confiar. A proposta inteira (plataforma, gatilho, dados) vive em
 * `value.integration.proposed` (server-side, via `builderState`); o submit só
 * carrega `{ cardKey: 'integration_proposal', action: 'confirm' }` — o handler
 * NUNCA lê o corpo da request (ver `card-submit.schemas.ts`).
 *
 * PRESENTATIONAL: lê seu slice de `props.value.integration.proposed` e dispara o
 * payload tipado via `props.onSubmit` / dismissa via `props.onDismiss`. NUNCA faz
 * fetch — o chat-panel é dono do POST + SSE. Token-driven (zero cor hard-coded),
 * tema via `props.tokens`. Copy PT-BR.
 *
 * Contract (CARD CONTRACTS): cardKey 'integration_proposal'
 *   payload → { cardKey: 'integration_proposal', action: 'confirm' }
 */

import type { ReactNode } from "react"
import { Check, Database, ExternalLink, Plug, Zap } from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { CardShell } from "../card-shell"
import type { CardComponentProps } from "../types"

/** EXACT submit payload for cardKey 'integration_proposal' (mirror of schema). */
export interface IntegrationProposalPayload {
  cardKey: "integration_proposal"
  action: "confirm"
}

/** Uma seção explicativa do card: ícone + rótulo + corpo (texto leigo). */
interface ProposalSectionProps {
  icon: ReactNode
  label: string
  body: string
  /** Destaca a seção (NFR-03: "quais dados são enviados" fica em evidência). */
  emphasis?: boolean
  tokens: AppTokens
}

function ProposalSection({
  icon,
  label,
  body,
  emphasis = false,
  tokens,
}: ProposalSectionProps) {
  return (
    <div
      className="rounded-md border p-3"
      style={{
        backgroundColor: emphasis ? tokens.brandSubtle : tokens.bgBase,
        borderColor: emphasis ? tokens.brand : tokens.divider,
      }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: tokens.brandSubtle, color: tokens.brand }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <span
            className="text-[12px] font-semibold"
            style={{ color: tokens.textPrimary }}
          >
            {label}
          </span>
          <p
            className="mt-0.5 text-[12px] leading-relaxed"
            style={{ color: tokens.textSecondary }}
          >
            {body}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * IntegrationProposalCard — apresenta a proposta de integração e oferece duas
 * ações: "Confirmar" (dispara `{ action: 'confirm' }`) e "Agora não"
 * (`onDismiss`). Ambas desabilitam enquanto `disabled` (chat streaming).
 */
export function IntegrationProposalCard({
  value,
  disabled = false,
  onSubmit,
  onDismiss,
  tokens,
}: CardComponentProps<IntegrationProposalPayload>) {
  const proposed = value.integration?.proposed

  // Sem proposta no state → não há o que confirmar. Nunca renderiza um card vazio.
  if (!proposed) return null

  const { platform, triggerDescription, whatDataSent, sources } = proposed

  const handleConfirm = () => {
    if (disabled) return
    onSubmit({ cardKey: "integration_proposal", action: "confirm" })
  }

  // "O que faz" deriva da proposta: prioriza o resumo de dados, cai pro gatilho.
  const whatItDoes =
    whatDataSent ??
    triggerDescription ??
    `Conectar seu agente ao ${platform} para automatizar parte do atendimento.`

  return (
    <CardShell
      icon={<Plug className="h-4 w-4" />}
      title={`Conectar ${platform}`}
      reason={`Encontrei uma forma de integrar seu agente com o ${platform}. Veja o que isso faz antes de confirmar.`}
      tokens={tokens}
      actions={[
        {
          label: "Confirmar",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled,
        },
        ...(onDismiss
          ? [
              {
                label: "Agora não",
                onClick: onDismiss,
                variant: "secondary" as const,
                disabled,
              },
            ]
          : []),
      ]}
    >
      <div className="flex flex-col gap-2.5">
        {/* O que faz — resumo leigo da integração. */}
        <ProposalSection
          icon={<Plug className="h-3.5 w-3.5" />}
          label="O que faz"
          body={whatItDoes}
          tokens={tokens}
        />

        {/* Quando o agente usa — o gatilho em linguagem natural. */}
        {triggerDescription != null && triggerDescription !== "" && (
          <ProposalSection
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Quando o agente usa"
            body={triggerDescription}
            tokens={tokens}
          />
        )}

        {/* Quais dados são enviados — em DESTAQUE (NFR-03 transparência). */}
        {whatDataSent != null && whatDataSent !== "" && (
          <ProposalSection
            icon={<Database className="h-3.5 w-3.5" />}
            label="Quais dados são enviados"
            body={whatDataSent}
            emphasis
            tokens={tokens}
          />
        )}

        {/* Fontes — links que embasaram a proposta (caminho investigador, W3). */}
        {sources != null && sources.length > 0 && (
          <div
            className="rounded-md border p-3"
            style={{ backgroundColor: tokens.bgBase, borderColor: tokens.divider }}
          >
            <span
              className="text-[12px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              Fontes
            </span>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {sources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[12px] leading-relaxed underline-offset-2 hover:underline"
                    style={{ color: tokens.brand }}
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{source.title ?? source.url}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </CardShell>
  )
}

export default IntegrationProposalCard
