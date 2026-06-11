"use client"

/**
 * Builder Cards — byok_guided (Jornada v2 · T99, FR-28)
 *
 * Card GUIADO de BYOK ("bring your own key"). NÃO é um step da jornada e NÃO
 * carrega sentinel: é um render CONDICIONAL do chat, dirigido pelo BLOCKER. Surfa
 * quando `readiness.blockers` contém `byok` E a fase ativa é "Lançar" — em vez do
 * aviso seco do blocker, mostra um card que ensina onde pegar a chave OpenAI e
 * leva direto para `/integracoes` (o `REDIRECT_BYOK` real do blocker, definido em
 * `next-pending-step.ts`).
 *
 * Blocker-driven, sem persistência: o card não submete payload nem flipa estado.
 * Ele SOME sozinho quando o blocker `byok` desaparece — i.e. quando o usuário
 * configura a chave e o readiness é refetchado (`byokProviderCount > 0`), sem
 * reload. A DECISÃO de renderizar vive no chat-panel (wiring dedicado, T70) e usa
 * o predicado puro {@link shouldRenderByokGuidedCard} exportado aqui, mantendo
 * uma única fonte de verdade para "aparece com blocker byok na fase Lançar".
 *
 * Presentational only + token-driven (zero cor hard-coded). Copy PT-BR.
 *
 * Contract: specs/jornada-builder-v2/spec.md (FR-28) + plan §4.1.
 */

import { ExternalLink, KeyRound } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type {
  PhaseId,
  ReadinessBlocker,
} from "@/server/ai-module/builder/state/readiness.types"

/**
 * Fallback de redirect quando o blocker não traz o seu (espelha o
 * `REDIRECT_BYOK = '/integracoes'` de `next-pending-step.ts`). Preferimos SEMPRE
 * o `redirect` do blocker quando presente — esta constante é só a rede.
 */
const REDIRECT_BYOK = "/integracoes"

/**
 * Predicado PURO que decide se o card guiado de BYOK deve renderizar: blocker
 * `byok` presente E fase ativa "Lançar". É a fonte única de verdade do "quando
 * aparece" — o chat-panel (wiring) chama isto a cada readiness. Quando o usuário
 * configura a chave, o blocker some no próximo readiness e o predicado vira
 * `false` → o card desaparece sem reload.
 */
export function shouldRenderByokGuidedCard(
  blockers: ReadinessBlocker[] | undefined,
  activePhaseId: PhaseId | undefined,
): boolean {
  if (activePhaseId !== "lancar") return false
  return Boolean(blockers?.some((blocker) => blocker.check === "byok"))
}

/** Localiza o blocker `byok` na lista (para reusar sua copy/CTA/redirect). */
export function findByokBlocker(
  blockers: ReadinessBlocker[] | undefined,
): ReadinessBlocker | undefined {
  return blockers?.find((blocker) => blocker.check === "byok")
}

export interface ByokGuidedCardProps {
  /**
   * O blocker `byok` resolvido pelo readiness, quando disponível. O card prefere
   * a copy/CTA/redirect dele; ausente, cai nos defaults locais.
   */
  blocker?: ReadinessBlocker
  /** Resolved design tokens (mesmos consumidos pelos demais cards). */
  tokens: AppTokens
  /**
   * Navegação para a tela de integrações. Opcional: sem ele o card usa um `<a>`
   * nativo para `redirect` (default `/integracoes`) — o link real do blocker.
   */
  onNavigate?: (redirect: string) => void
}

/** Passos curtos de "onde pegar a chave" — guia honesto, sem prometer atalho. */
const STEPS: string[] = [
  "Entre em platform.openai.com e abra a seção API keys.",
  "Crie uma chave nova (Create new secret key) e copie o valor.",
  "Cole a chave aqui em Integrações — ela fica guardada com segurança.",
]

/**
 * ByokGuidedCard — card guiado de chave de IA (FR-28). Renderizado SOMENTE pelo
 * chat-panel quando {@link shouldRenderByokGuidedCard} é `true`; não se
 * auto-oculta (some quando o pai para de renderizá-lo após o refetch do
 * readiness). Leva o usuário a `/integracoes` para colar a chave OpenAI.
 */
export function ByokGuidedCard({
  blocker,
  tokens,
  onNavigate,
}: ByokGuidedCardProps) {
  const redirect = blocker?.redirect ?? REDIRECT_BYOK
  const ctaLabel = blocker?.cta ?? "Configurar chave de IA"

  const handleNavigate = () => {
    if (onNavigate) onNavigate(redirect)
  }

  return (
    <div
      className="max-w-[95%] rounded-lg border p-4"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <KeyRound className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[13px] font-semibold"
            style={{ color: tokens.textPrimary }}
          >
            Cole sua chave OpenAI para publicar
          </p>
          <p
            className="mt-1 text-[13px] leading-relaxed"
            style={{ color: tokens.textSecondary }}
          >
            Falta só a chave de IA. Ela alimenta as respostas do agente — você
            usa a sua própria chave (BYOK), então o consumo fica na sua conta.
          </p>
        </div>
      </div>

      <ol className="mt-4 flex flex-col gap-2">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-start gap-2.5">
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
              style={{
                backgroundColor: tokens.brandSubtle,
                color: tokens.brandText,
              }}
            >
              {index + 1}
            </span>
            <span
              className="text-[12px] leading-relaxed"
              style={{ color: tokens.textSecondary }}
            >
              {step}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {onNavigate ? (
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-8 gap-1.5 text-[12px]"
            onClick={handleNavigate}
          >
            <KeyRound className="h-3.5 w-3.5" />
            {ctaLabel}
          </Button>
        ) : (
          <a
            href={redirect}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium"
            style={{
              backgroundColor: tokens.brand,
              color: tokens.brandText,
            }}
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            {ctaLabel}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
        <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
          O card some sozinho assim que a chave for salva.
        </span>
      </div>
    </div>
  )
}

export default ByokGuidedCard
