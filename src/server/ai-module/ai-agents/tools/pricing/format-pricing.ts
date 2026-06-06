/**
 * format-pricing — helpers PUROS de formatação de preço do get_pricing (M2).
 *
 * Folha testável, SEM I/O, SEM dependência de DB. Extraído do `formatPrice` local
 * que vivia em `get-pricing.ts` para que a formatação por `disclosureStyle` (exact /
 * from / average / none) possa ser testada isoladamente e reaproveitada.
 *
 * Princípios:
 *  - PURO: mesma entrada → mesma saída, sem efeitos colaterais.
 *  - FAIL-SAFE: nunca lança. Entradas inválidas degradam para o piso ou para
 *    `undefined`, nunca quebram a frase que o agente fala.
 *  - Centavos → reais SEM float drift: aritmética inteira (`Math.floor(c/100)` +
 *    `c % 100` com `padStart(2,'0')`). Espelha a semântica de `centsToBrl` do card,
 *    PORÉM sem `toLocaleString` (sem separador de milhar) — o separador de milhar
 *    confunde o LLM ("1.234" vira "mil" ou número quebrado); aqui só vírgula decimal.
 *
 * Contrato exportado:
 *   formatPriceCents(cents, currency): string
 *   formatItemPrice(item, currency, style): string | undefined
 */

/** Estilos globais de divulgação de preço (espelha `disclosureStyle` da PriceList). */
export type PriceDisclosureStyle = 'exact' | 'from' | 'average' | 'none'

/** Shape mínimo (por item) que a formatação precisa. `priceMaxCents` é o teto da faixa. */
export interface PriceItemForFormat {
  readonly priceCents: number
  readonly priceMaxCents?: number | null
}

/**
 * Formata centavos em moeda, SEM float drift: 4500 → "R$ 45,00", 123456 → "R$ 1234,56".
 *
 * - Aritmética 100% inteira (sanitiza com `Math.trunc` e `Math.max(0, ...)`): nenhum
 *   `(c/100).toFixed(2)` que poderia arrastar erro de ponto flutuante.
 * - Sem separador de milhar (proposital): só vírgula decimal, para o LLM ler limpo.
 * - `currency === 'BRL'` → prefixo "R$ "; qualquer outra moeda → "<CODE> " (ex.: "USD ").
 * - Fail-safe: `NaN`/`Infinity`/negativo → tratado como 0 ("R$ 0,00").
 */
export function formatPriceCents(cents: number, currency: string): string {
  const safe = Number.isFinite(cents) ? Math.max(0, Math.trunc(cents)) : 0
  const reais = Math.floor(safe / 100)
  const remainder = safe % 100
  const value = `${reais},${remainder.toString().padStart(2, '0')}`
  const code = currency.trim().toUpperCase()
  return code === 'BRL' ? `R$ ${value}` : `${code} ${value}`
}

/**
 * Formata o preço de um item segundo o `disclosureStyle` GLOBAL, com fail-safe:
 *
 *  - 'exact'   → "R$ 45,00"                  (preço cravado = piso)
 *  - 'from'    → "a partir de R$ 45,00"      (prefixo + piso)
 *  - 'average' → "entre R$ 200,00 e R$ 350,00" (piso + teto via `priceMaxCents`)
 *                FAIL-SAFE: se `priceMaxCents` ausente/null/inválido (`<= priceCents`,
 *                não-finito), CAI para o piso formatando como 'from' — NUNCA inventa
 *                teto nem quebra a frase.
 *  - 'none'    → `undefined`                  (o agente NÃO cita valor)
 *
 * Qualquer estilo desconhecido (defesa) degrada para 'exact'. Puro e fail-safe.
 */
export function formatItemPrice(
  item: PriceItemForFormat,
  currency: string,
  style: PriceDisclosureStyle,
): string | undefined {
  if (style === 'none') return undefined

  const floor = formatPriceCents(item.priceCents, currency)

  if (style === 'from') return `a partir de ${floor}`

  if (style === 'average') {
    const max = item.priceMaxCents
    const validCeiling =
      typeof max === 'number' &&
      Number.isFinite(max) &&
      Math.trunc(max) > Math.trunc(item.priceCents)
    // Teto válido → faixa real; senão cai para o piso como 'from' (sem inventar teto).
    if (validCeiling) {
      const ceil = formatPriceCents(max as number, currency)
      return `entre ${floor} e ${ceil}`
    }
    return `a partir de ${floor}`
  }

  // 'exact' (e fallback defensivo p/ qualquer estilo não previsto) → preço cravado.
  return floor
}
