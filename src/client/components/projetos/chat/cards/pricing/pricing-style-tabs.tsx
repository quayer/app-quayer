"use client"

/**
 * Builder Cards — pricing / PricingStyleTabs (Onda B, G4)
 *
 * Subcomponente VISUAL do card `pricing`. Renderiza um radiogroup com os 4 modos
 * de divulgação de preço — como o AGENTE fala o valor para o cliente:
 *
 *   - exact   → "R$ 250"                    (valor exato)
 *   - from    → "a partir de R$ 250"        (a partir de) — recomendado
 *   - average → "entre R$ 200 e R$ 350"     (faixa média; exige min..max)
 *   - none    → não fala preço              (qualifica e encaminha)
 *
 * PRESENTATIONAL: não tem estado próprio nem faz fetch. O estado (`value`) e a
 * persistência vivem no parent `pricing-card.tsx`, que repassa `value` +
 * `onChange`. Quando o estilo for `average`, o parent é quem coleta a faixa
 * (priceCents = piso, priceMaxCents = teto) por linha — este componente apenas
 * sinaliza o modo escolhido.
 *
 * Estilização: 100% via design tokens (`AppTokens`, vindo de useAppTokens no
 * parent → props.tokens), inline `style`. ZERO cor hard-coded. Copy PT-BR.
 *
 * Contrato exposto (consumido por pricing-card.tsx):
 *   export type PricingDisclosureStyle
 *   export interface PricingStyleTabsProps
 *   export function PricingStyleTabs(props): JSX.Element
 */

import type { JSX } from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

// ==========================================
// Contrato público
// ==========================================

/**
 * Como o agente DIVULGA o preço ao cliente. É um valor global do card `pricing`
 * (vive em `pricing.disclosureStyle` no BuilderState) — decide a forma de FALAR,
 * não o dado em si. `average` é o único que exige uma faixa (min..max) por item.
 *
 * Definido localmente aqui (e re-exportado) para manter este subcomponente
 * self-contained: o parent `pricing-card.tsx` importa este tipo daqui, evitando
 * acoplamento circular com o builder-state durante o desenvolvimento da Onda B.
 */
export type PricingDisclosureStyle = "exact" | "from" | "average" | "none"

export interface PricingStyleTabsProps {
  /** Estilo atualmente selecionado (controlado pelo parent). */
  value: PricingDisclosureStyle
  /** Bloqueia interação enquanto o chat está streamando / submetendo. */
  disabled?: boolean
  /** Tokens de design resolvidos (mesmo objeto dos demais cards). */
  tokens: AppTokens
  /** Dispara a troca de estilo UP para o parent. */
  onChange: (next: PricingDisclosureStyle) => void
}

// ==========================================
// Opções (ordem de exibição)
// ==========================================

const STYLE_OPTIONS: ReadonlyArray<{
  key: PricingDisclosureStyle
  label: string
  hint: string
  recommended?: boolean
}> = [
  {
    key: "exact",
    label: "Valor exato",
    hint: 'O agente fala o preço cravado: "R$ 250".',
  },
  {
    key: "from",
    label: "A partir de",
    hint: 'Ancora pelo menor valor: "a partir de R$ 250".',
    recommended: true,
  },
  {
    key: "average",
    label: "Faixa média",
    hint: 'Mostra um intervalo: "entre R$ 200 e R$ 350".',
  },
  {
    key: "none",
    label: "Não falar preço",
    hint: "O agente qualifica e encaminha sem dizer o valor.",
  },
]

// ==========================================
// Componente
// ==========================================

export function PricingStyleTabs({
  value,
  disabled = false,
  tokens,
  onChange,
}: PricingStyleTabsProps): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="Estilo de divulgação de preço"
      className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {STYLE_OPTIONS.map((option) => {
        const selected = value === option.key
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.key)}
            className="flex min-h-[64px] flex-col rounded-md border px-3 py-2 text-left transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              backgroundColor: selected ? tokens.brandSubtle : tokens.bgBase,
              borderColor: selected ? tokens.brand : tokens.divider,
            }}
          >
            <span className="flex items-center justify-between gap-2">
              <span
                className="text-[13px] font-medium"
                style={{ color: tokens.textPrimary }}
              >
                {option.label}
              </span>
              {option.recommended && (
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide"
                  style={{
                    backgroundColor: tokens.brand,
                    color: tokens.textInverse,
                  }}
                >
                  Recomendado
                </span>
              )}
            </span>
            <span
              className="mt-1 block text-[11px] leading-snug"
              style={{ color: tokens.textSecondary }}
            >
              {option.hint}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default PricingStyleTabs
