"use client"

/**
 * Builder Cards — published_next_steps (Jornada v2 · T48, FR-16)
 *
 * Card TERMINAL da fase "Lançar": surfa SÓ depois que o agente foi publicado
 * (deployment vivo) e o ack ainda está pendente (override no engine v2, igual ao
 * silenced_contacts). Comemora a publicação e entrega os três próximos passos
 * (FR-16):
 *   1. Testar do celular — deep-link wa.me que abre o WhatsApp no telefone.
 *   2. Ver Atividade     — navega para a tab "Atividade" via `onTabChange`.
 *   3. Como pausar        — explica que dá pra pausar o agente quando quiser.
 *
 * A única ação é um `'ack'` informativo: confirma que o usuário leu os próximos
 * passos, flipa `confirmations.publishedNextSteps` e tira o card do slot. Como é
 * terminal/opcional, NUNCA bloqueia a jornada nem o isDeployReady.
 *
 * Presentational only: lê seu slice de `props.value` (não precisa de nenhum) e
 * dispara o payload tipado via `props.onSubmit` (chat-panel owns POST + SSE — o
 * card NUNCA faz fetch). Token-driven (zero cor hard-coded). Copy PT-BR.
 *
 * Contract (CARD CONTRACTS): cardKey 'published_next_steps'
 *   payload  → { cardKey: 'published_next_steps', action: 'ack' }
 *   sentinel → confirmations.publishedNextSteps
 */

import type { ReactNode } from "react"
import { Activity, PartyPopper, PauseCircle, Smartphone } from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"
import type { PreviewTab } from "../../types"

/** EXACT submit payload for cardKey 'published_next_steps' (mirror of schema). */
export interface PublishedNextStepsPayload {
  cardKey: "published_next_steps"
  action: "ack"
}

/**
 * Mensagem pré-pronta do wa.me: abre o WhatsApp no celular já com um rascunho.
 * O usuário escolhe o chat (ou manda pra si mesmo) e testa o agente de verdade,
 * de onde estiver. Sem número fixo — o número conectado não vive no BuilderState,
 * então usamos a forma genérica `wa.me/?text=` (igual ao share da agenda).
 */
const WA_TEST_TEXT =
  "Oi! Quero testar meu atendente. Me responde o que você sabe fazer? 🙂"
const WA_TEST_URL = `https://wa.me/?text=${encodeURIComponent(WA_TEST_TEXT)}`

/**
 * Props que o ActiveStepCard injeta neste card (navegação de tab). É OPCIONAL e
 * aditiva — o contrato base `CardComponentProps` (types.ts) fica intocado; a
 * etapa de wiring passa `onTabChange`. Até lá, "Ver Atividade" simplesmente não
 * aparece (nunca promete uma ação que não consegue fazer).
 */
type PublishedNextStepsCardProps =
  CardComponentProps<PublishedNextStepsPayload> & {
    /** FR-16 — leva à tab "Atividade" do preview-panel para ver as conversas. */
    onTabChange?: (tab: PreviewTab) => void
  }

/** Uma linha de "próximo passo": ícone + título + descrição + ação opcional. */
interface NextStepRowProps {
  icon: ReactNode
  title: string
  description: string
  /** CTA opcional (link externo OU botão). Omitido → linha puramente informativa. */
  action?: ReactNode
  tokens: AppTokens
}

function NextStepRow({
  icon,
  title,
  description,
  action,
  tokens,
}: NextStepRowProps) {
  return (
    <div
      className="rounded-md border p-3"
      style={{ backgroundColor: tokens.bgBase, borderColor: tokens.divider }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: tokens.brandSubtle, color: tokens.brand }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <span
            className="text-[13px] font-medium"
            style={{ color: tokens.textPrimary }}
          >
            {title}
          </span>
          <p
            className="mt-1 text-[12px] leading-relaxed"
            style={{ color: tokens.textSecondary }}
          >
            {description}
          </p>
          {action != null && <div className="mt-2.5">{action}</div>}
        </div>
      </div>
    </div>
  )
}

/**
 * PublishedNextStepsCard — comemora a publicação e mostra os 3 próximos passos
 * (testar do celular, ver Atividade, como pausar). Uma ação única "Entendi"
 * dispara `{ action: 'ack' }`, que flipa o sentinel e tira o card do slot.
 */
export function PublishedNextStepsCard({
  disabled = false,
  onSubmit,
  onTabChange,
  tokens,
}: PublishedNextStepsCardProps) {
  const handleAck = () => {
    if (disabled) return
    onSubmit({ cardKey: "published_next_steps", action: "ack" })
  }

  return (
    <CardShell
      icon={<PartyPopper className="h-4 w-4" />}
      title="Seu agente está no ar! 🎉"
      reason="Publicado e atendendo. Veja como testar do celular, acompanhar as conversas e pausar quando precisar."
      tokens={tokens}
      actions={[
        {
          label: "Entendi",
          onClick: handleAck,
          variant: "primary",
          disabled,
        },
      ]}
    >
      <div className="flex flex-col gap-2.5">
        {/* 1. Testar do celular — deep-link wa.me. Link externo (não é submit). */}
        <NextStepRow
          icon={<Smartphone className="h-4 w-4" />}
          title="Teste do seu celular"
          description="Abra o WhatsApp no telefone e mande uma mensagem pro agente. É a melhor forma de sentir como ele responde de verdade."
          tokens={tokens}
          action={
            <a
              href={WA_TEST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors"
              style={{
                backgroundColor: tokens.bgSurface,
                borderColor: tokens.divider,
                color: tokens.brand,
              }}
            >
              <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
              Abrir no WhatsApp
            </a>
          }
        />

        {/* 2. Ver Atividade — navega para a tab "Atividade" via onTabChange. O CTA
            só aparece quando o wiring injeta o callback (senão, fica informativo). */}
        <NextStepRow
          icon={<Activity className="h-4 w-4" />}
          title="Acompanhe as conversas"
          description="A aba Atividade mostra, em tempo real, as mensagens que o agente está trocando com seus clientes."
          tokens={tokens}
          action={
            onTabChange ? (
              <button
                type="button"
                onClick={() => onTabChange("activity")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  backgroundColor: tokens.bgSurface,
                  borderColor: tokens.divider,
                  color: tokens.brand,
                }}
              >
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                Ver Atividade
              </button>
            ) : undefined
          }
        />

        {/* 3. Como pausar — puramente informativo (sem CTA). */}
        <NextStepRow
          icon={<PauseCircle className="h-4 w-4" />}
          title="Pause quando quiser"
          description="Precisa atender você mesmo por um tempo? Pause o agente pelo botão de status no topo do projeto — ele para de responder na hora e volta quando você reativar."
          tokens={tokens}
        />
      </div>
    </CardShell>
  )
}

export default PublishedNextStepsCard
