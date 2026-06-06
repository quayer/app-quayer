/**
 * Builder Cards — Pricing / formatação da DIVULGAÇÃO de preço (Onda B, G4)
 *
 * Lógica PURA (sem I/O, sem React, sem `any`) que decide COMO o agente FALA um
 * preço, dado o estilo global de divulgação (`disclosureStyle`) e os centavos
 * de uma linha da tabela:
 *   - `priceCents`     → piso (min) da faixa, INT em centavos.
 *   - `priceMaxCents`  → teto (max) OPCIONAL da faixa, INT em centavos. Só faz
 *                        sentido quando o estilo é `average`.
 *
 * Esta é a ÚNICA fonte da frase mostrada no live-preview do card de preços e é
 * reaproveitada conceitualmente pela copy de ACK (o agente confirma o que vai
 * dizer). Reusa a mesma máscara de centavos do `pricing-card.tsx`
 * (`centsToMasked`), mantendo o piso/teto sempre como INT — nunca parseamos
 * float, evitando drift tipo 19.99 → 1998.99999.
 *
 * Estilos (`PricingDisclosureStyle`):
 *   - `exact`   → "R$ 250,00"                     (fala o valor cheio)
 *   - `from`    → "a partir de R$ 250,00"         (fala o piso como mínimo)
 *   - `average` → "entre R$ 200,00 e R$ 350,00"   (fala a faixa min..max)
 *                 Faixa inválida (max ≤ min ou sem teto) cai para `exact`/`from`
 *                 — o agente nunca diz uma faixa sem sentido.
 *   - `none`    → ""                              (o agente NÃO fala o preço)
 *
 * Contrato consumido por outros arquivos da Onda B (card + ACK):
 *   export type PricingDisclosureStyle = 'exact' | 'from' | 'average' | 'none'
 *   export function formatDisclosure(style, priceCents, priceMaxCents?): string
 *   export function isRowComplete(style, priceCents, priceMaxCents?): boolean
 */

/**
 * Estilo global de divulgação — decide COMO o agente fala o preço de CADA item.
 * É um campo único no topo de `pricing` (não por linha); `priceMaxCents` só é
 * coletado/significativo quando o estilo é `average`.
 */
export type PricingDisclosureStyle = "exact" | "from" | "average" | "none"

/**
 * Conjunto de estilos válidos — usado para validar entrada vinda do estado
 * (JSONB) sem confiar cegamente numa string arbitrária.
 */
const DISCLOSURE_STYLES: ReadonlySet<string> = new Set<PricingDisclosureStyle>([
  "exact",
  "from",
  "average",
  "none",
])

/**
 * `true` quando `value` é um dos {@link PricingDisclosureStyle} conhecidos.
 * Type guard para sanitizar o estilo lido do estado antes de formatar.
 */
export function isPricingDisclosureStyle(
  value: unknown,
): value is PricingDisclosureStyle {
  return typeof value === "string" && DISCLOSURE_STYLES.has(value)
}

/**
 * Normaliza um valor de centavos para um INT não-negativo. Defesa contra
 * float/negativo/NaN vindos do estado (mesma postura do `rowsFromState` no
 * card). Retorna 0 quando não há valor utilizável.
 */
function normalizeCents(cents: number | undefined): number {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return 0
  return Math.max(0, Math.round(cents))
}

/**
 * Render de um INT de centavos como string BRL mascarada: 25000 → "R$ 250,00".
 *
 * Espelha o `centsToMasked` do `pricing-card.tsx`, com UMA diferença proposital:
 * aqui o decimal é SEMPRE mostrado ("R$ 250,00", não "R$ 250"), porque é a frase
 * que o agente VAI FALAR/confirmar — manter os centavos evita ambiguidade
 * ("250" poderia soar como reais ou centavos). Pura, nunca produz float.
 */
function centsToMasked(cents: number): string {
  const safe = normalizeCents(cents)
  const reais = Math.floor(safe / 100)
  const remainder = safe % 100
  const reaisStr = reais.toLocaleString("pt-BR")
  const centsStr = remainder.toString().padStart(2, "0")
  return `R$ ${reaisStr},${centsStr}`
}

/**
 * `true` quando a faixa `priceCents..priceMaxCents` é uma faixa válida de fato,
 * ou seja, ambos os pisos são positivos e o teto é estritamente maior que o
 * piso. Faixa degenerada (sem teto, teto ≤ piso) NÃO é faixa.
 */
function hasValidRange(
  priceCents: number,
  priceMaxCents: number | undefined,
): boolean {
  const floor = normalizeCents(priceCents)
  const ceiling = normalizeCents(priceMaxCents)
  return floor > 0 && ceiling > floor
}

/**
 * Formata COMO o agente fala o preço de uma linha, dado o estilo global.
 *
 * Garantias:
 *  - `none`  → sempre "" (o agente não divulga o preço).
 *  - piso ausente/zero (exceto `none`) → "" (não dá pra falar um preço que não
 *    existe; o card trata a linha como incompleta via {@link isRowComplete}).
 *  - `average` com faixa inválida → degrada graciosamente para `from` quando há
 *    teto desejado mas inválido… na prática, sem teto válido caímos para a frase
 *    de valor cheio (`exact`) — nunca renderizamos "entre X e Y" sem Y > X.
 *
 * @param style          Estilo global de divulgação.
 * @param priceCents     Piso (min) em centavos, INT.
 * @param priceMaxCents  Teto (max) opcional em centavos, INT. Só usado em `average`.
 * @returns A frase PT-BR que o agente fala, ou "" quando não há preço a dizer.
 */
export function formatDisclosure(
  style: PricingDisclosureStyle,
  priceCents: number,
  priceMaxCents?: number,
): string {
  // `none` nunca divulga preço — independe dos centavos.
  if (style === "none") return ""

  const floor = normalizeCents(priceCents)
  // Sem piso utilizável não há frase possível para os estilos que falam preço.
  if (floor <= 0) return ""

  const floorMasked = centsToMasked(floor)

  switch (style) {
    case "exact":
      // "R$ 250,00"
      return floorMasked

    case "from":
      // "a partir de R$ 250,00"
      return `a partir de ${floorMasked}`

    case "average":
      // "entre R$ 200,00 e R$ 350,00" — só quando a faixa é válida.
      if (hasValidRange(floor, priceMaxCents)) {
        const ceilingMasked = centsToMasked(normalizeCents(priceMaxCents))
        return `entre ${floorMasked} e ${ceilingMasked}`
      }
      // Faixa inválida (sem teto / teto ≤ piso): degrada para valor cheio,
      // assim o agente ainda fala algo coerente em vez de uma faixa quebrada.
      return floorMasked

    default:
      // Estilo desconhecido não deveria chegar aqui (type guard upstream), mas
      // por segurança caímos no valor cheio em vez de estourar.
      return floorMasked
  }
}

/**
 * `true` quando uma linha está "completa o suficiente" para o estilo escolhido,
 * ou seja, o agente consegue de fato falar um preço com ela.
 *
 * Regras por estilo:
 *  - `none`    → sempre completa (não precisa de preço nenhum).
 *  - `exact`   → precisa de piso > 0.
 *  - `from`    → precisa de piso > 0.
 *  - `average` → precisa de faixa VÁLIDA (teto estritamente maior que o piso),
 *                porque "entre X e Y" exige Y > X.
 *
 * Usada pelo card para mostrar o hint inline de faixa e habilitar/destacar a
 * linha; o sanitizer do servidor faz o espelho disto ao persistir.
 */
export function isRowComplete(
  style: PricingDisclosureStyle,
  priceCents: number,
  priceMaxCents?: number,
): boolean {
  if (style === "none") return true

  const floor = normalizeCents(priceCents)

  if (style === "average") {
    // `average` exige a faixa completa (piso > 0 E teto > piso).
    return hasValidRange(floor, priceMaxCents)
  }

  // `exact` e `from` precisam apenas de um piso utilizável.
  return floor > 0
}
