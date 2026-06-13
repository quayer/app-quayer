/**
 * Builder Module — `pricing` card application.
 *
 * Pure `(state, payload) => CardApplication`: sanitizes the submitted catalog,
 * stores it in builderState and flips the `pricing` sentinel.
 */

import {
  patchBuilderState,
  applyConfirmation,
  type BuilderState,
  type DeepPartial,
} from '../../builder-state'
import type {
  PricingItemPayload,
  PricingPayload,
} from '../../card-submit.schemas'
import type { CardApplication } from '../apply-card-submit'

/** Estilos de divulgação válidos — espelho do enum no schema/builder-state. */
const PRICING_DISCLOSURE_STYLES = [
  'exact',
  'from',
  'average',
  'none',
] as const
type PricingDisclosureStyle = (typeof PRICING_DISCLOSURE_STYLES)[number]
const PRICING_DISCLOSURE_SET: ReadonlySet<string> = new Set(
  PRICING_DISCLOSURE_STYLES,
)

/**
 * Re-valida o estilo de divulgação (G4) server-side: cai para 'exact' (o default)
 * se vier algo fora do conjunto conhecido. Nunca confia no body.
 */
function sanitizeDisclosureStyle(
  style: string | undefined,
): PricingDisclosureStyle {
  return style && PRICING_DISCLOSURE_SET.has(style)
    ? (style as PricingDisclosureStyle)
    : 'exact'
}

/** `true` quando uma URL https(s) é confiável o suficiente para persistir (G5b). */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

/**
 * Re-validate pricing items server-side: trim names, floor/clamp cents to int>=0,
 * e (Onda B) condiciona os novos campos ao estilo de divulgação global:
 *  - `priceMaxCents` (G4) só é mantido quando o estilo é 'average' E o teto é
 *    estritamente maior que o piso (`priceCents`); caso contrário é descartado,
 *    para o JSONB nunca guardar uma faixa sem sentido.
 *  - `imageUrl` (G5b) é mantido só quando é uma URL http(s) válida (trim + cap),
 *    senão é descartado.
 */
function sanitizePricingItems(
  items: readonly PricingItemPayload[],
  disclosureStyle: PricingDisclosureStyle,
): PricingItemPayload[] {
  const out: PricingItemPayload[] = []
  for (const item of items) {
    const name = item.name.trim()
    if (name.length === 0) continue
    // priceCents is already int>=0 via Zod; clamp defensively (never trust body).
    const priceCents = Math.max(0, Math.trunc(item.priceCents))
    const category = item.category?.trim()

    // G4 — teto da faixa: só quando 'average' E max > piso. Senão dropamos.
    let priceMaxCents: number | undefined
    if (disclosureStyle === 'average' && typeof item.priceMaxCents === 'number') {
      const ceiling = Math.max(0, Math.trunc(item.priceMaxCents))
      if (ceiling > priceCents) priceMaxCents = ceiling
    }

    // G5b — foto do serviço: só uma URL http(s) válida (cap a 2000 chars).
    let imageUrl: string | undefined
    if (typeof item.imageUrl === 'string') {
      const trimmed = item.imageUrl.trim().slice(0, 2000)
      if (trimmed.length > 0 && isHttpUrl(trimmed)) imageUrl = trimmed
    }

    out.push({
      name,
      priceCents,
      ...(category && category.length > 0 ? { category } : {}),
      ...(priceMaxCents !== undefined ? { priceMaxCents } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    })
  }
  return out
}

/** Normalize a currency code to an uppercase 3-letter ISO-ish code. */
function sanitizeCurrency(currency: string): string {
  const trimmed = currency.trim().toUpperCase()
  return trimmed.length === 3 ? trimmed : 'BRL'
}

/** Frase PT-BR de COMO o agente fala o preço (G4), para a copy do ACK. */
const DISCLOSURE_LABELS: Record<PricingDisclosureStyle, string> = {
  exact: 'valor exato (ex.: "R$ 250")',
  from: 'a partir de (ex.: "a partir de R$ 250")',
  average: 'faixa média (ex.: "entre R$ 200 e R$ 350")',
  none: 'não informar o preço (qualifica e encaminha)',
}

/** Render server-side de centavos → "R$ 1.234,56" para a copy do ACK (min ticket). */
function centsToBrl(cents: number): string {
  const safe = Math.max(0, Math.trunc(cents))
  const reais = Math.floor(safe / 100)
  const remainder = safe % 100
  const reaisStr = reais.toLocaleString('pt-BR')
  return `R$ ${reaisStr},${remainder.toString().padStart(2, '0')}`
}

export function applyPricing(
  state: BuilderState,
  payload: Pick<
    PricingPayload,
    'items' | 'currency' | 'disclosureStyle' | 'minTicketCents'
  >,
): CardApplication {
  // builderState only — the deploy saga materializes PriceList/PriceItem later.
  const disclosureStyle = sanitizeDisclosureStyle(payload.disclosureStyle)
  const items = sanitizePricingItems(payload.items, disclosureStyle)
  const currency = sanitizeCurrency(payload.currency)

  // G5a — min ticket: mantém só um inteiro > 0; 0/null/ausente significa SEM valor
  // mínimo. A tabela é submetida wholesale, então "ausente" = o usuário REMOVEU.
  let minTicketCents: number | undefined
  if (typeof payload.minTicketCents === 'number') {
    const cents = Math.max(0, Math.trunc(payload.minTicketCents))
    if (cents > 0) minTicketCents = cents
  }

  const patch: DeepPartial<BuilderState> = {
    pricing: {
      items,
      currency,
      disclosureStyle,
      ...(minTicketCents !== undefined ? { minTicketCents } : {}),
    },
  }
  // deepMerge pula `undefined`, então um min ticket ausente preservaria o valor
  // antigo. Limpamos o escalar explicitamente para o checkbox poder ser desmarcado.
  let merged = patchBuilderState(state, patch)
  if (minTicketCents === undefined && merged.pricing.minTicketCents !== undefined) {
    merged = { ...merged, pricing: { ...merged.pricing, minTicketCents: undefined } }
  }
  const next = applyConfirmation(merged, 'pricing')

  const countLabel = items.length === 1 ? '1 item' : `${items.length} itens`
  const withPhotoCount = items.filter((i) => Boolean(i.imageUrl)).length
  const photoNote =
    withPhotoCount > 0
      ? ` ${withPhotoCount === 1 ? '1 item tem' : `${withPhotoCount} itens têm`} foto (catálogo visual).`
      : ''
  const minTicketNote =
    minTicketCents !== undefined
      ? ` Valor mínimo de atendimento: ${centsToBrl(minTicketCents)}.`
      : ''

  return {
    next,
    cardInstruction:
      `O usuário CADASTROU a tabela de preços via card (${countLabel} em ${currency}).${photoNote}${minTicketNote} ` +
      `Ao falar de preço, use o formato: ${DISCLOSURE_LABELS[disclosureStyle]}. ` +
      'Use a tool get_pricing para responder sobre preços e siga para o próximo passo. ' +
      'Não reabra o card de preços.',
  }
}
